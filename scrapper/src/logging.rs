//! Logging setup. CLI mode logs to stderr (respecting the config level); inside a web UI job,
//! warnings and errors are also copied into the job's log. The TUI logs nothing (it would
//! corrupt the alternate screen).

use std::str::FromStr;

use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::{Context, SubscriberExt};
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{filter::LevelFilter, fmt, EnvFilter, Layer};

/// Map the Python-style level strings (`DEBUG`/`INFO`/...) to a tracing [`LevelFilter`].
pub fn level_filter(level: &str) -> LevelFilter {
    match level.to_ascii_uppercase().as_str() {
        "DEBUG" => LevelFilter::DEBUG,
        "WARNING" | "WARN" => LevelFilter::WARN,
        "ERROR" => LevelFilter::ERROR,
        "TRACE" => LevelFilter::TRACE,
        _ => LevelFilter::INFO,
    }
}

/// Initialise stderr logging for CLI mode. Honours `RUST_LOG` if set, else the config level.
pub fn init_cli(level: &str) {
    let filter = EnvFilter::from_str(&format!("scrapper={}", level.to_ascii_lowercase()))
        .unwrap_or_else(|_| EnvFilter::default().add_directive(level_filter(level).into()));
    let filter = match std::env::var("RUST_LOG") {
        Ok(v) if !v.is_empty() => EnvFilter::new(v),
        _ => filter,
    };
    let _ = tracing_subscriber::registry()
        .with(fmt::layer().with_writer(std::io::stderr).with_target(false).with_filter(filter))
        .with(ConsoleLayer)
        .try_init();
}

/// Copies this crate's warnings and errors into a captured run's log (a web UI job), so a
/// failing API call shows up next to the output it explains. A no-op on the CLI.
struct ConsoleLayer;

impl<S: Subscriber> Layer<S> for ConsoleLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        if *meta.level() > Level::WARN || !meta.target().starts_with("scrapper") {
            return;
        }
        let Some(console) = crate::ops::out::current() else { return };
        let mut text = MessageText(String::new());
        event.record(&mut text);
        let mark = if *meta.level() == Level::ERROR { "✗" } else { "⚠" };
        (console.log)(format!("{mark} {}", text.0.trim()));
    }
}

/// The event's message, then any other fields as `key=value`.
struct MessageText(String);

impl Visit for MessageText {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        use std::fmt::Write;
        if field.name() == "message" {
            let _ = write!(self.0, "{value:?} ");
        } else {
            let _ = write!(self.0, "{}={value:?} ", field.name());
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.0.push_str(value);
            self.0.push(' ');
        } else {
            self.0.push_str(&format!("{}={value} ", field.name()));
        }
    }
}
