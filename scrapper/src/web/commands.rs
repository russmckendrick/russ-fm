//! Every CLI command, from the browser. [`catalog`] describes the clap command tree (names,
//! help, flags, defaults, choices) so the web UI renders a form for each command straight from
//! the CLI definition, and [`parse`] turns a submitted argv back into a [`Cli`] the same way
//! the terminal does. The job then runs [`cli::run`] with its output captured
//! (see [`crate::ops::out`]).

use clap::{Arg, Command as ClapCommand, CommandFactory, Parser};
use serde::Serialize;

use crate::cli::{Cli, Command};

/// One command (or command group) as the web UI renders it.
#[derive(Debug, Serialize)]
pub struct CommandSpec {
    pub name: String,
    /// Words after `scrapper`, e.g. `["db", "search"]`.
    pub path: Vec<String>,
    pub about: Option<String>,
    pub long_about: Option<String>,
    pub args: Vec<ArgSpec>,
    pub subcommands: Vec<CommandSpec>,
}

#[derive(Debug, Serialize)]
pub struct ArgSpec {
    pub id: String,
    /// `positional`, `flag` (no value) or `value`.
    pub kind: &'static str,
    pub long: Option<String>,
    pub short: Option<char>,
    pub help: Option<String>,
    pub long_help: Option<String>,
    pub required: bool,
    pub default: Option<String>,
    /// Allowed values, when clap restricts them.
    pub choices: Vec<String>,
    pub value_name: Option<String>,
    /// Takes a comma-separated list (`--services a,b`).
    pub multiple: bool,
}

/// Commands the web UI doesn't offer: `init` writes a config into the server's working
/// directory, and the terminal UI's own flags mean nothing here.
const HIDDEN_COMMANDS: &[&str] = &["init", "help"];
const HIDDEN_ARGS: &[&str] = &["help", "version", "tui", "port", "no_open"];

/// The command tree under `scrapper`.
pub fn catalog() -> Vec<CommandSpec> {
    let root = Cli::command();
    root.get_subcommands()
        .filter(|c| !c.is_hide_set() && !HIDDEN_COMMANDS.contains(&c.get_name()))
        .map(|c| spec(c, Vec::new()))
        .collect()
}

fn spec(cmd: &ClapCommand, parent: Vec<String>) -> CommandSpec {
    let mut path = parent;
    path.push(cmd.get_name().to_string());
    CommandSpec {
        name: cmd.get_name().to_string(),
        about: cmd.get_about().map(|s| s.to_string()),
        long_about: cmd.get_long_about().map(|s| s.to_string()),
        args: cmd
            .get_arguments()
            .filter(|a| !a.is_hide_set() && !a.is_global_set() && !HIDDEN_ARGS.contains(&a.get_id().as_str()))
            .map(arg_spec)
            .collect(),
        subcommands: cmd
            .get_subcommands()
            .filter(|c| !c.is_hide_set() && c.get_name() != "help")
            .map(|c| spec(c, path.clone()))
            .collect(),
        path,
    }
}

fn arg_spec(a: &Arg) -> ArgSpec {
    let takes_value = a.get_action().takes_values();
    ArgSpec {
        id: a.get_id().to_string(),
        kind: if a.is_positional() {
            "positional"
        } else if takes_value {
            "value"
        } else {
            "flag"
        },
        long: a.get_long().map(String::from),
        short: a.get_short(),
        help: a.get_help().map(|s| s.to_string()),
        long_help: a.get_long_help().map(|s| s.to_string()),
        required: a.is_required_set(),
        default: (takes_value && !a.get_default_values().is_empty())
            .then(|| a.get_default_values().iter().map(|v| v.to_string_lossy()).collect::<Vec<_>>().join(",")),
        choices: a.get_possible_values().iter().filter(|p| !p.is_hide_set()).map(|p| p.get_name().to_string()).collect(),
        value_name: a.get_value_names().and_then(|v| v.first()).map(|s| s.to_string()),
        multiple: a.get_value_delimiter().is_some(),
    }
}

/// Parse `args` (the words after `scrapper`) exactly as the terminal would, refusing what a
/// browser job can't or shouldn't run.
pub fn parse(args: &[String]) -> Result<Cli, String> {
    let argv = std::iter::once("scrapper".to_string()).chain(args.iter().cloned());
    let cli = Cli::try_parse_from(argv).map_err(|e| e.render().to_string())?;
    if cli.config.is_some() {
        return Err("--config can't be changed from the web UI (it uses the config scrapper started with)".into());
    }
    match &cli.command {
        None => Err("name a command, e.g. `status` or `release 123456 --save`".into()),
        Some(Command::Init(_)) => Err("`init` isn't available from the web UI — run it in a terminal".into()),
        Some(Command::Collection(a)) if a.interactive => {
            Err("`collection --interactive` opens the terminal UI — use the Add page's picker instead".into())
        }
        Some(_) => Ok(cli),
    }
}

/// `scrapper <args>`, quoting words with spaces, for job titles.
pub fn display(args: &[String]) -> String {
    let words: Vec<String> = args
        .iter()
        .map(|a| if a.is_empty() || a.contains(char::is_whitespace) { format!("\"{a}\"") } else { a.clone() })
        .collect();
    format!("scrapper {}", words.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &str) -> Vec<String> {
        s.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn catalog_covers_the_cli() {
        let cat = catalog();
        let names: Vec<&str> = cat.iter().map(|c| c.name.as_str()).collect();
        for want in ["release", "collection", "artist", "backfill-videos", "db", "maintenance", "status"] {
            assert!(names.contains(&want), "missing {want}");
        }
        assert!(!names.contains(&"init"));

        let db = cat.iter().find(|c| c.name == "db").unwrap();
        let search = db.subcommands.iter().find(|c| c.name == "search").unwrap();
        assert_eq!(search.path, vec!["db", "search"]);
        let kind = search.args.iter().find(|a| a.id == "kind").unwrap();
        assert_eq!(kind.kind, "positional");
        assert_eq!(kind.choices, vec!["release", "artist"]);

        let videos = cat.iter().find(|c| c.name == "backfill-videos").unwrap();
        let batch = videos.args.iter().find(|a| a.id == "batch_size").unwrap();
        assert_eq!((batch.kind, batch.default.as_deref()), ("value", Some("25")));
        assert!(videos.args.iter().any(|a| a.id == "masters" && a.kind == "flag" && a.help.is_some()));
        // Global flags aren't per-command fields.
        assert!(!videos.args.iter().any(|a| a.id == "config" || a.id == "log_level"));
    }

    #[test]
    fn parse_matches_the_terminal_and_refuses_the_rest() {
        assert!(parse(&args("release 123 --save --interactive")).is_ok());
        assert!(parse(&args("backfill-videos --masters --limit 5")).is_ok());
        assert!(parse(&args("backfill-videos --masters --theaudiodb")).unwrap_err().contains("cannot be used with"));
        assert!(parse(&args("collection --interactive")).is_err());
        assert!(parse(&args("init")).is_err());
        assert!(parse(&args("status --config /tmp/x.json")).is_err());
        assert!(parse(&[]).is_err());
    }

    #[test]
    fn display_quotes_spaces() {
        assert_eq!(display(&["artist".into(), "Talk Talk".into(), "--save".into()]), "scrapper artist \"Talk Talk\" --save");
    }
}
