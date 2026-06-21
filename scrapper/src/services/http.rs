//! Shared HTTP primitives for service clients: a per-service rate limiter, a configured
//! reqwest client, and a retry helper with backoff.

use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};
use thiserror::Error;

/// Errors surfaced by service clients.
#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("auth error: {0}")]
    Auth(String),
    #[error("rate limited by upstream")]
    RateLimited,
    #[error("not found")]
    NotFound,
    #[error("unexpected response: {0}")]
    Unexpected(String),
    #[error("{0}")]
    Other(String),
}

pub type ServiceResult<T> = Result<T, ServiceError>;

/// A simple async rate limiter wrapping governor's direct limiter.
#[derive(Clone)]
pub struct Limiter {
    inner: Arc<DefaultDirectRateLimiter>,
}

impl Limiter {
    /// Build a limiter allowing `per_minute` requests per minute (minimum 1).
    pub fn per_minute(per_minute: u32) -> Self {
        let n = NonZeroU32::new(per_minute.max(1)).unwrap();
        Self {
            inner: Arc::new(RateLimiter::direct(Quota::per_minute(n))),
        }
    }

    /// Build a limiter allowing `per_hour` requests per hour (minimum 1).
    pub fn per_hour(per_hour: u32) -> Self {
        let n = NonZeroU32::new(per_hour.max(1)).unwrap();
        Self {
            inner: Arc::new(RateLimiter::direct(Quota::per_hour(n))),
        }
    }

    /// Wait until a request is permitted.
    pub async fn acquire(&self) {
        self.inner.until_ready().await;
    }
}

/// Build a reqwest client with a default User-Agent and sensible timeouts.
pub fn build_client(user_agent: &str) -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(user_agent)
        .timeout(Duration::from_secs(30))
        .build()
        .expect("building reqwest client")
}

/// Retry an async operation up to `attempts` times with linear backoff on transient errors.
pub async fn with_retry<T, F, Fut>(attempts: u32, delay: Duration, mut op: F) -> ServiceResult<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = ServiceResult<T>>,
{
    let mut last: Option<ServiceError> = None;
    for attempt in 0..attempts.max(1) {
        match op().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                let transient = matches!(
                    e,
                    ServiceError::RateLimited | ServiceError::Http(_) | ServiceError::Unexpected(_)
                );
                last = Some(e);
                if !transient || attempt + 1 == attempts.max(1) {
                    break;
                }
                tokio::time::sleep(delay * (attempt + 1)).await;
            }
        }
    }
    Err(last.unwrap_or_else(|| ServiceError::Other("retry failed".into())))
}
