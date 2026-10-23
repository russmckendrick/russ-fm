//! `test` command — live connectivity/auth probes for every configured service, run concurrently.

use anyhow::Result;

use crate::services::{Probe, Services};
use crate::Config;

pub async fn test_all(cfg: &Config) -> Result<()> {
    crate::say!("Probing services...\n");
    let services = Services::new(cfg);
    let results = services.test_all().await;

    let mut healthy = 0;
    let mut configured = 0;
    for (name, probe) in &results {
        match probe {
            Probe::Ok(detail) => {
                healthy += 1;
                configured += 1;
                crate::say!("  ✓ {name:<12} {detail}");
            }
            Probe::Failed(err) => {
                configured += 1;
                crate::say!("  ✗ {name:<12} {err}");
            }
            Probe::Skipped(reason) => {
                crate::say!("  – {name:<12} {reason}");
            }
        }
    }
    crate::say!("\n{healthy}/{configured} configured services healthy");
    Ok(())
}
