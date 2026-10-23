//! Where command output goes. On the CLI it's stdout; inside a web UI job it's that job's log,
//! with `--interactive` prompts routed to the browser. A tokio task-local [`Console`] carries
//! the redirection, so the same command code serves both without threading a sink through
//! every function: ops write with [`say!`](crate::say) instead of `println!`.

use std::future::Future;
use std::sync::Arc;

use tokio::sync::mpsc::UnboundedSender;

use super::release::UiRequest;

/// A captured run's destination for lines, progress and interactive prompts.
#[derive(Clone)]
pub struct Console {
    pub log: Arc<dyn Fn(String) + Send + Sync>,
    pub progress: Arc<dyn Fn(usize, usize) + Send + Sync>,
    /// Interactive match-picks and description reviews, when the front end can answer them.
    pub prompts: Option<UnboundedSender<UiRequest>>,
}

tokio::task_local! {
    static CONSOLE: Console;
}

/// Run `fut` with its output captured by `console`.
pub async fn capture<F: Future>(console: Console, fut: F) -> F::Output {
    CONSOLE.scope(console, fut).await
}

/// Run sync `f` (e.g. on a blocking thread) with its output captured by `console`.
pub fn capture_sync<R>(console: Console, f: impl FnOnce() -> R) -> R {
    CONSOLE.sync_scope(console, f)
}

/// The active console, if output is being captured.
pub fn current() -> Option<Console> {
    CONSOLE.try_with(Console::clone).ok()
}

/// True when output is captured (so there is no terminal to prompt on).
pub fn captured() -> bool {
    CONSOLE.try_with(|_| ()).is_ok()
}

/// Write `text` (possibly several lines): stdout on the CLI, the job log when captured. In a
/// log, blank separator lines are dropped and multi-line text is split.
pub fn line(text: String) {
    match current() {
        Some(c) => {
            for l in text.lines().filter(|l| !l.trim().is_empty()) {
                (c.log)(l.to_string());
            }
        }
        None => println!("{text}"),
    }
}

/// Report per-item progress. A no-op on the CLI, where the log lines already say it.
pub fn progress(done: usize, total: usize) {
    if let Some(c) = current() {
        (c.progress)(done, total);
    }
}

/// `println!` for ops: stdout on the CLI, the job log inside a web UI job.
#[macro_export]
macro_rules! say {
    () => {
        $crate::ops::out::line(String::new())
    };
    ($($arg:tt)*) => {
        $crate::ops::out::line(format!($($arg)*))
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[tokio::test]
    async fn captures_lines_and_progress_inside_scope_only() {
        let lines = Arc::new(Mutex::new(Vec::<String>::new()));
        let prog = Arc::new(Mutex::new(None));
        let (l, p) = (lines.clone(), prog.clone());
        let console = Console {
            log: Arc::new(move |s| l.lock().unwrap().push(s)),
            progress: Arc::new(move |d, t| *p.lock().unwrap() = Some((d, t))),
            prompts: None,
        };
        assert!(!captured());
        capture(console.clone(), async {
            assert!(captured());
            crate::say!("one\n\ntwo");
            tokio::task::yield_now().await;
            progress(1, 3);
        })
        .await;
        capture_sync(console, || crate::say!("three"));
        assert_eq!(*lines.lock().unwrap(), vec!["one", "two", "three"]);
        assert_eq!(*prog.lock().unwrap(), Some((1, 3)));
    }
}
