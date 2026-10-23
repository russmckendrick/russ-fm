//! Background jobs for the web UI: each job runs an op on the tokio runtime and streams its log
//! lines, progress and interactive prompts to every connected browser over one SSE feed.
//!
//! Prompts reuse the TUI's plumbing: a job hands the op a [`MatchPicker::Tui`] channel, and the
//! forwarder here turns each [`UiRequest`] into a [`PromptView`] the browser answers by POST.

use std::collections::VecDeque;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::{broadcast, mpsc::unbounded_channel, oneshot};
use tokio::task::AbortHandle;

use crate::ops::out::Console;
use crate::ops::release::{DescribeAction, MatchPicker, UiRequest};
use crate::util::now_iso;

/// Finished jobs kept for the Jobs page (oldest are dropped first).
const KEEP_JOBS: usize = 50;
/// Log lines kept per job (a full collection pass can log thousands).
const KEEP_LOG_LINES: usize = 5000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Running,
    Done,
    Failed,
    Cancelled,
}

/// An interactive question a job is waiting on, as the browser renders it.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptView {
    /// Choose one candidate row (or skip).
    Pick { id: u64, prompt: String, header: Vec<String>, rows: Vec<Vec<String>> },
    /// Review a Perplexity description: regenerate with edited context, accept or skip.
    Describe { id: u64, artist: String, album: String, preview: String, context: String },
}

impl PromptView {
    fn id(&self) -> u64 {
        match self {
            PromptView::Pick { id, .. } | PromptView::Describe { id, .. } => *id,
        }
    }
}

/// The browser's answer to a [`PromptView`].
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PromptAnswer {
    Pick { index: Option<usize> },
    Generate { context: String },
    Accept,
    Skip,
}

enum PromptReply {
    Pick(oneshot::Sender<Option<usize>>),
    Describe(oneshot::Sender<DescribeAction>),
}

/// A job as the browser sees it. `log` is omitted from list views.
#[derive(Clone, Debug, Serialize)]
pub struct JobSnapshot {
    pub id: u64,
    pub kind: String,
    pub title: String,
    pub status: JobStatus,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub progress: Option<(usize, usize)>,
    pub error: Option<String>,
    pub result: Option<Value>,
    pub prompt: Option<PromptView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log: Option<Vec<String>>,
}

/// One message on the SSE feed. `seq` is global and increasing, so a client that loaded a
/// snapshot can drop events it has already seen.
#[derive(Clone, Debug, Serialize)]
pub struct Envelope {
    pub seq: u64,
    #[serde(flatten)]
    pub event: Event,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    JobStarted { job: JobSnapshot },
    Log { job_id: u64, line: String },
    Progress { job_id: u64, done: usize, total: usize },
    Prompt { job_id: u64, prompt: PromptView },
    PromptCleared { job_id: u64, prompt_id: u64 },
    JobFinished { job: JobSnapshot },
}

struct JobState {
    status: JobStatus,
    finished_at: Option<String>,
    progress: Option<(usize, usize)>,
    error: Option<String>,
    result: Option<Value>,
    log: VecDeque<String>,
    prompt: Option<PromptView>,
    reply: Option<PromptReply>,
    abort: Option<AbortHandle>,
}

struct Job {
    id: u64,
    kind: String,
    title: String,
    started_at: String,
    state: Mutex<JobState>,
}

impl Job {
    fn snapshot(&self, with_log: bool) -> JobSnapshot {
        let st = self.state.lock().expect("job state");
        JobSnapshot {
            id: self.id,
            kind: self.kind.clone(),
            title: self.title.clone(),
            status: st.status,
            started_at: self.started_at.clone(),
            finished_at: st.finished_at.clone(),
            progress: st.progress,
            error: st.error.clone(),
            result: st.result.clone(),
            prompt: st.prompt.clone(),
            log: with_log.then(|| st.log.iter().cloned().collect()),
        }
    }
}

struct Inner {
    next_id: AtomicU64,
    seq: AtomicU64,
    jobs: Mutex<Vec<Arc<Job>>>,
    tx: broadcast::Sender<Envelope>,
}

/// The job registry, shared by every request handler.
#[derive(Clone)]
pub struct Jobs {
    inner: Arc<Inner>,
}

impl Default for Jobs {
    fn default() -> Self {
        Self::new()
    }
}

impl Jobs {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(4096);
        Self {
            inner: Arc::new(Inner {
                next_id: AtomicU64::new(1),
                seq: AtomicU64::new(0),
                jobs: Mutex::new(Vec::new()),
                tx,
            }),
        }
    }

    /// Subscribe to the event feed. Subscribe *before* taking a snapshot so nothing is missed.
    pub fn subscribe(&self) -> broadcast::Receiver<Envelope> {
        self.inner.tx.subscribe()
    }

    /// The last sequence number sent (a snapshot is current up to here).
    pub fn seq(&self) -> u64 {
        self.inner.seq.load(Ordering::SeqCst)
    }

    fn emit(&self, event: Event) {
        let seq = self.inner.seq.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = self.inner.tx.send(Envelope { seq, event });
    }

    fn get(&self, id: u64) -> Option<Arc<Job>> {
        self.inner.jobs.lock().expect("jobs").iter().find(|j| j.id == id).cloned()
    }

    /// Every job, newest first, without logs.
    pub fn list(&self) -> Vec<JobSnapshot> {
        self.inner.jobs.lock().expect("jobs").iter().rev().map(|j| j.snapshot(false)).collect()
    }

    /// One job with its log.
    pub fn snapshot(&self, id: u64) -> Option<JobSnapshot> {
        self.get(id).map(|j| j.snapshot(true))
    }

    /// The running job of `kind`, if any (jobs of one kind never overlap).
    pub fn running(&self, kind: &str) -> Option<u64> {
        self.inner
            .jobs
            .lock()
            .expect("jobs")
            .iter()
            .find(|j| j.kind == kind && j.state.lock().expect("job state").status == JobStatus::Running)
            .map(|j| j.id)
    }

    /// Start a job. `f` gets a [`JobCtx`] for logging, progress and prompts; its `Ok(value)` is
    /// kept as the job's result. Fails when a job of the same kind is already running.
    pub fn spawn<F, Fut>(&self, kind: &str, title: impl Into<String>, f: F) -> Result<u64, u64>
    where
        F: FnOnce(JobCtx) -> Fut,
        Fut: Future<Output = anyhow::Result<Option<Value>>> + Send + 'static,
    {
        if let Some(existing) = self.running(kind) {
            return Err(existing);
        }
        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        let job = Arc::new(Job {
            id,
            kind: kind.to_string(),
            title: title.into(),
            started_at: now_iso(),
            state: Mutex::new(JobState {
                status: JobStatus::Running,
                finished_at: None,
                progress: None,
                error: None,
                result: None,
                log: VecDeque::new(),
                prompt: None,
                reply: None,
                abort: None,
            }),
        });
        {
            let mut jobs = self.inner.jobs.lock().expect("jobs");
            jobs.push(job.clone());
            // Drop the oldest finished jobs beyond the cap.
            while jobs.len() > KEEP_JOBS {
                match jobs.iter().position(|j| j.state.lock().expect("job state").status != JobStatus::Running) {
                    Some(i) => {
                        jobs.remove(i);
                    }
                    None => break,
                }
            }
        }
        self.emit(Event::JobStarted { job: job.snapshot(false) });

        let fut = f(JobCtx { jobs: self.clone(), id });
        let jobs = self.clone();
        let handle = tokio::spawn(async move {
            let outcome = fut.await;
            jobs.finish(id, outcome);
        });
        job.state.lock().expect("job state").abort = Some(handle.abort_handle());
        Ok(id)
    }

    fn finish(&self, id: u64, outcome: anyhow::Result<Option<Value>>) {
        let Some(job) = self.get(id) else { return };
        {
            let mut st = job.state.lock().expect("job state");
            if st.status != JobStatus::Running {
                return;
            }
            match outcome {
                Ok(result) => {
                    st.status = JobStatus::Done;
                    st.result = result;
                }
                Err(e) => {
                    st.status = JobStatus::Failed;
                    st.error = Some(format!("{e:#}"));
                }
            }
            st.finished_at = Some(now_iso());
            st.prompt = None;
            st.reply = None;
            st.abort = None;
        }
        self.emit(Event::JobFinished { job: job.snapshot(false) });
    }

    /// Stop a running job. Returns false when it isn't running.
    pub fn cancel(&self, id: u64) -> bool {
        let Some(job) = self.get(id) else { return false };
        {
            let mut st = job.state.lock().expect("job state");
            if st.status != JobStatus::Running {
                return false;
            }
            if let Some(abort) = st.abort.take() {
                abort.abort();
            }
            st.status = JobStatus::Cancelled;
            st.finished_at = Some(now_iso());
            st.prompt = None;
            st.reply = None;
        }
        self.emit(Event::JobFinished { job: job.snapshot(false) });
        true
    }

    /// Deliver the browser's answer to a job's open prompt.
    pub fn answer(&self, id: u64, prompt_id: u64, answer: PromptAnswer) -> Result<(), &'static str> {
        let job = self.get(id).ok_or("no such job")?;
        let reply = {
            let mut st = job.state.lock().expect("job state");
            if st.prompt.as_ref().map(PromptView::id) != Some(prompt_id) {
                return Err("that prompt is no longer open");
            }
            let fits = matches!(
                (&st.reply, &answer),
                (Some(PromptReply::Pick(_)), PromptAnswer::Pick { .. } | PromptAnswer::Skip)
                    | (Some(PromptReply::Describe(_)), PromptAnswer::Generate { .. } | PromptAnswer::Accept | PromptAnswer::Skip)
            );
            if !fits {
                return Err("answer doesn't match the prompt");
            }
            st.prompt = None;
            st.reply.take().ok_or("that prompt is no longer open")?
        };
        let sent = match (reply, answer) {
            (PromptReply::Pick(tx), PromptAnswer::Pick { index }) => tx.send(index).is_ok(),
            (PromptReply::Pick(tx), PromptAnswer::Skip) => tx.send(None).is_ok(),
            (PromptReply::Describe(tx), PromptAnswer::Generate { context }) => tx.send(DescribeAction::Generate(context)).is_ok(),
            (PromptReply::Describe(tx), PromptAnswer::Accept) => tx.send(DescribeAction::Accept).is_ok(),
            (PromptReply::Describe(tx), PromptAnswer::Skip) => tx.send(DescribeAction::Skip).is_ok(),
            _ => unreachable!("checked above"),
        };
        self.emit(Event::PromptCleared { job_id: id, prompt_id });
        if sent {
            Ok(())
        } else {
            Err("the job stopped waiting")
        }
    }

    fn log(&self, id: u64, line: String) {
        if let Some(job) = self.get(id) {
            let mut st = job.state.lock().expect("job state");
            st.log.push_back(line.clone());
            if st.log.len() > KEEP_LOG_LINES {
                st.log.pop_front();
            }
        }
        self.emit(Event::Log { job_id: id, line });
    }

    fn progress(&self, id: u64, done: usize, total: usize) {
        if let Some(job) = self.get(id) {
            job.state.lock().expect("job state").progress = Some((done, total));
        }
        self.emit(Event::Progress { job_id: id, done, total });
    }

    fn open_prompt(&self, id: u64, req: UiRequest) {
        let prompt_id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        let (view, reply) = match req {
            UiRequest::Pick(p) => (
                PromptView::Pick {
                    id: prompt_id,
                    prompt: p.prompt,
                    header: p.header.iter().map(|h| h.to_string()).collect(),
                    rows: p.rows,
                },
                PromptReply::Pick(p.reply),
            ),
            UiRequest::Describe(d) => (
                PromptView::Describe {
                    id: prompt_id,
                    artist: d.artist,
                    album: d.album,
                    preview: d.preview,
                    context: d.context,
                },
                PromptReply::Describe(d.reply),
            ),
        };
        let Some(job) = self.get(id) else { return };
        {
            let mut st = job.state.lock().expect("job state");
            if st.status != JobStatus::Running {
                return;
            }
            st.prompt = Some(view.clone());
            st.reply = Some(reply);
        }
        self.emit(Event::Prompt { job_id: id, prompt: view });
    }
}

/// Handed to a job's body: where it logs, reports progress and asks questions.
#[derive(Clone)]
pub struct JobCtx {
    jobs: Jobs,
    id: u64,
}

impl JobCtx {
    pub fn log(&self, line: impl Into<String>) {
        self.jobs.log(self.id, line.into());
    }

    pub fn progress(&self, done: usize, total: usize) {
        self.jobs.progress(self.id, done, total);
    }

    /// Closures for an op's [`ProgressSink`](crate::ops::release::ProgressSink):
    /// `let (l, p) = ctx.sink_fns(); let sink = ProgressSink { log: &l, progress: &p };`
    #[allow(clippy::type_complexity)]
    pub fn sink_fns(&self) -> (impl Fn(String) + Send + Sync, impl Fn(usize, usize) + Send + Sync) {
        let (a, b) = (self.clone(), self.clone());
        (move |line: String| a.log(line), move |d, t| b.progress(d, t))
    }

    /// A channel whose [`UiRequest`]s surface as prompts in the browser.
    fn prompt_channel(&self) -> tokio::sync::mpsc::UnboundedSender<UiRequest> {
        let (tx, mut rx) = unbounded_channel::<UiRequest>();
        let ctx = self.clone();
        tokio::spawn(async move {
            while let Some(req) = rx.recv().await {
                ctx.jobs.open_prompt(ctx.id, req);
            }
        });
        tx
    }

    /// An interactive [`MatchPicker`] whose questions surface as prompts in the browser.
    pub fn picker(&self) -> MatchPicker {
        MatchPicker::Tui(self.prompt_channel())
    }

    /// A [`Console`] for running CLI code inside this job: its output becomes the job log and
    /// `--interactive` questions become browser prompts.
    pub fn console(&self) -> Console {
        let (a, b) = (self.clone(), self.clone());
        Console {
            log: Arc::new(move |line| a.log(line)),
            progress: Arc::new(move |d, t| b.progress(d, t)),
            prompts: Some(self.prompt_channel()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::time::Duration;

    /// Job id → its open prompt's id.
    fn open_prompts(jobs: &Jobs) -> HashMap<u64, u64> {
        jobs.list().into_iter().filter_map(|j| j.prompt.map(|p| (j.id, p.id()))).collect()
    }

    async fn wait_for<T>(mut f: impl FnMut() -> Option<T>) -> T {
        for _ in 0..200 {
            if let Some(v) = f() {
                return v;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        panic!("timed out");
    }

    #[tokio::test]
    async fn job_logs_and_finishes_with_result() {
        let jobs = Jobs::new();
        let mut rx = jobs.subscribe();
        let id = jobs
            .spawn("t", "test", |ctx| async move {
                ctx.log("hello");
                ctx.progress(1, 2);
                Ok(Some(serde_json::json!({"n": 1})))
            })
            .unwrap();
        let snap = wait_for(|| jobs.snapshot(id).filter(|s| s.status == JobStatus::Done)).await;
        assert_eq!(snap.log.unwrap(), vec!["hello".to_string()]);
        assert_eq!(snap.progress, Some((1, 2)));
        assert_eq!(snap.result.unwrap()["n"], 1);
        // Events arrive in order with increasing seq.
        let mut last = 0;
        while let Ok(env) = rx.try_recv() {
            assert!(env.seq > last);
            last = env.seq;
        }
        assert_eq!(last, jobs.seq());
    }

    #[tokio::test]
    async fn same_kind_does_not_overlap() {
        let jobs = Jobs::new();
        let first = jobs
            .spawn("t", "a", |_| async {
                tokio::time::sleep(Duration::from_secs(5)).await;
                Ok(None)
            })
            .unwrap();
        assert_eq!(jobs.spawn("t", "b", |_| async { Ok(None) }), Err(first));
        assert!(jobs.cancel(first));
        assert_eq!(jobs.snapshot(first).unwrap().status, JobStatus::Cancelled);
        assert!(jobs.spawn("t", "c", |_| async { Ok(None) }).is_ok());
    }

    #[tokio::test]
    async fn pick_prompt_round_trips() {
        let jobs = Jobs::new();
        let id = jobs
            .spawn("t", "pick", |ctx| async move {
                let picker = ctx.picker();
                let choice = picker.pick("Spotify · X", &["Title"], &[vec!["A".into()], vec!["B".into()]]).await;
                Ok(Some(serde_json::json!(choice)))
            })
            .unwrap();
        let prompt_id = wait_for(|| open_prompts(&jobs).get(&id).copied()).await;
        assert!(jobs.answer(id, prompt_id, PromptAnswer::Accept).is_err(), "wrong answer type is rejected");
        assert!(jobs.answer(id, prompt_id + 1, PromptAnswer::Skip).is_err(), "stale prompt id is rejected");
        jobs.answer(id, prompt_id, PromptAnswer::Pick { index: Some(1) }).unwrap();
        let snap = wait_for(|| jobs.snapshot(id).filter(|s| s.status == JobStatus::Done)).await;
        assert_eq!(snap.result.unwrap(), 1);
        assert!(snap.prompt.is_none());
    }
}
