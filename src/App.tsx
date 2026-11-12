import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Images,
  PawPrint,
  Plus,
  Search,
  ArrowUpRight,
  X,
  ImagePlus,
  Trash2,
  Pencil,
  Heart,
  Sun,
  ShieldCheck,
  Download,
  SlidersHorizontal,
  Ellipsis,
  Check,
  LogOut,
  RefreshCw,
} from "lucide-react";
import Corgi from "./Corgi";
import {
  activities,
  moods,
  today,
  maxPhotoBytes,
  entrySchema,
  type Entry,
  type EntryInput,
  type Photo,
} from "../shared/model";
import {
  api,
  loadConfig,
  finishSignIn,
  accessToken,
  signIn,
  signOut,
  type Config,
} from "./auth";

const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  },
) =>
  new Intl.DateTimeFormat("en-GB", options).format(
    new Date(`${date}T12:00:00`),
  );
type Draft = EntryInput & { id: string };
type SelectedPhoto = Photo & { file?: File };
function dogName() {
  try {
    return (
      localStorage.getItem(
        `corgi-dog-${sessionStorage.getItem("corgi-account") ?? "demo"}`,
      ) ?? ""
    );
  } catch {
    return "";
  }
}
const blank = (): Draft => ({
  id: crypto.randomUUID(),
  dogName: dogName(),
  date: today(),
  title: "",
  body: "",
  activity: "Other",
  mood: "Happy",
  photos: [],
  revision: 0,
});
const draftKey = (id: string) =>
  `corgi-draft-${sessionStorage.getItem("corgi-account") ?? "demo"}-${id}`;
function readDraft(id: string): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null");
  } catch {
    return null;
  }
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current!;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Editor({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry | null;
  onClose: () => void;
  onSaved: (e: Entry) => void;
}) {
  const [initial] = useState<Draft>(
    () => readDraft(entry?.id ?? "new") ?? (entry ? { ...entry } : blank()),
  );
  const [draft, setDraft] = useState(initial),
    [photos, setPhotos] = useState<SelectedPhoto[]>(initial.photos),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draftProblem, setDraftProblem] = useState("");
  const errorRef = useRef<HTMLDivElement>(null),
    urls = useRef<string[]>([]),
    fileRef = useRef<HTMLInputElement>(null);
  const persistenceKey = entry?.id ?? "new";
  useEffect(() => {
    try {
      localStorage.setItem(
        draftKey(persistenceKey),
        JSON.stringify({
          ...draft,
          photos: photos
            .filter((p) => !p.file)
            .map(({ key, alt, url }) => ({ key, alt, url })),
        }),
      );
    } catch {
      setDraftProblem(
        "This browser cannot keep a draft. Keep this window open until your memory is saved.",
      );
    }
  }, [draft, photos, persistenceKey]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      urls.current.forEach(URL.revokeObjectURL);
    };
  }, []);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function close() {
    if (busy) return;
    if (
      photos.some((p) => p.file) &&
      !confirm(
        "Keep the text draft and close? Selected photos will need to be attached again.",
      )
    )
      return;
    onClose();
  }
  function attach(files: FileList | null) {
    if (!files) return;
    setError("");
    const selected = [...files];
    if (selected.length + photos.length > 4) {
      setError("You can attach up to 4 photos to a memory.");
      return;
    }
    if (
      selected.some(
        (f) =>
          !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
          f.size > maxPhotoBytes,
      )
    ) {
      setError("Choose JPEG, PNG or WebP photos, up to 3 MB each.");
      return;
    }
    setPhotos((p) => [
      ...p,
      ...selected.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        return { key: crypto.randomUUID(), url, alt: "", file };
      }),
    ]);
    if (fileRef.current) fileRef.current.value = "";
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = entrySchema.safeParse({
      ...draft,
      title:
        draft.title.trim() || draft.body.trim().split("\n")[0].slice(0, 80),
      photos: photos.map(({ key, alt }) => ({ key, alt })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      const uploaded = [...photos];
      for (let i = 0; i < uploaded.length; i++) {
        const p = uploaded[i];
        if (p.file) {
          const form = new FormData();
          form.append("file", p.file);
          const photo = await api<{ key: string; url: string }>("/photos", {
            method: "POST",
            body: form,
          });
          uploaded[i] = { ...photo, alt: p.alt };
          setPhotos([...uploaded]);
        }
      }
      const saved = await api<Entry>(`/entries/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...parsed.data,
          photos: uploaded.map(({ key, alt }) => ({ key, alt })),
        }),
      });
      try {
        localStorage.removeItem(draftKey(persistenceKey));
        localStorage.setItem(
          `corgi-dog-${sessionStorage.getItem("corgi-account") ?? "demo"}`,
          saved.dogName,
        );
      } catch {
        /* The API confirmed the save; browser storage failure must not report a failed save. */
      }
      onSaved(saved);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your memory could not be saved. Please try again.",
      );
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={entry ? "Edit your note" : "A little note about today"}
      onClose={close}
      wide
    >
      <p className="muted intro">What did your best friend get up to?</p>
      <form onSubmit={save}>
        <div className="draft-note">
          <ShieldCheck size={16} />
          <span>
            {draftProblem ||
              "Your text draft stays here. Reattach photos after a reload."}
          </span>
        </div>
        {error && (
          <div className="error" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </div>
        )}
        <fieldset disabled={busy}>
          <div className="form-row">
            <label>
              Dog’s name <span className="required">(required)</span>
              <input
                required
                autoComplete="off"
                maxLength={40}
                value={draft.dogName}
                onChange={(e) => change("dogName", e.target.value)}
                placeholder="e.g. Mochi"
              />
            </label>
            <label>
              Date <span className="required">(required)</span>
              <input
                type="date"
                required
                value={draft.date}
                onChange={(e) => change("date", e.target.value)}
              />
            </label>
          </div>
          <label>
            Today’s story <span className="required">(required)</span>
            <textarea
              required
              rows={4}
              maxLength={5000}
              value={draft.body}
              onChange={(e) => change("body", e.target.value)}
              placeholder="A new trick? A muddy walk? A very important nap?"
            />
            <span className="field-hint">
              {draft.body.length.toLocaleString()} / 5,000 characters
            </span>
          </label>
          <div className="photo-label">
            <h3>
              Photos <span className="required">(optional)</span>
            </h3>
            <span className="muted">{photos.length} / 4</span>
          </div>
          <p id="photo-help" className="field-hint">
            JPEG, PNG or WebP · up to 3 MB each. Original photos may contain
            location metadata.
          </p>
          {photos.length > 0 && (
            <div className="upload-list">
              {photos.map((p, i) => (
                <div className="upload-item" key={p.key}>
                  <img src={p.url} alt="" />
                  <label>
                    Photo {i + 1} description{" "}
                    <span className="required">(required)</span>
                    <input
                      required
                      maxLength={200}
                      value={p.alt}
                      placeholder="e.g. Mochi playing in the park"
                      onChange={(e) =>
                        setPhotos((ps) =>
                          ps.map((photo, j) =>
                            j === i ? { ...photo, alt: e.target.value } : photo,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() =>
                      setPhotos((ps) => ps.filter((_, j) => j !== i))
                    }
                  >
                    <X size={19} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            id="photo-input"
            className="sr-only"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            aria-label="Attach photos"
            aria-describedby="photo-help"
            onChange={(e) => attach(e.target.files)}
          />
          <button
            type="button"
            className="upload-button"
            disabled={photos.length >= 4}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={24} />
            <span>
              <strong>Add photos</strong>
              <small>Up to 4 little moments</small>
            </span>
            <Plus size={20} />
          </button>
          <details className="optional-details">
            <summary>
              More details <span>(optional)</span>
            </summary>
            <div className="optional-content">
              <label>
                Memory title <span className="required">(optional)</span>
                <input
                  maxLength={100}
                  value={draft.title}
                  onChange={(e) => change("title", e.target.value)}
                  placeholder="Leave blank to use the first line of your note"
                />
              </label>
              <div className="form-row">
                <label>
                  Activity
                  <select
                    value={draft.activity}
                    onChange={(e) =>
                      change("activity", e.target.value as Draft["activity"])
                    }
                  >
                    {activities.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Mood
                  <select
                    value={draft.mood}
                    onChange={(e) =>
                      change("mood", e.target.value as Draft["mood"])
                    }
                  >
                    {moods.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Discard your text draft and selected photos? This cannot be undone.",
                    )
                  ) {
                    localStorage.removeItem(draftKey(persistenceKey));
                    setPhotos(entry?.photos ?? []);
                    setDraft(entry ? { ...entry } : blank());
                    setError("");
                  }
                }}
              >
                Discard draft
              </button>
            </div>
          </details>
        </fieldset>
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            Keep draft & close
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <>
                <RefreshCw size={17} />
                Saving your note…
              </>
            ) : (
              <>
                <Check size={18} />
                Save note
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [authenticated, setAuthenticated] = useState(false),
    [configError, setConfigError] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [view, setView] = useState(
      location.hash === "#photos" ? "photos" : "journal",
    );
  const [search, setSearch] = useState(""),
    [activity, setActivity] = useState("All activities"),
    [date, setDate] = useState(""),
    [editor, setEditor] = useState<{ entry: Entry | null } | null>(null),
    [detail, setDetail] = useState<Entry | null>(null),
    [deleting, setDeleting] = useState<Entry | null>(null),
    [deleteBusy, setDeleteBusy] = useState(false);
  async function refresh() {
    setError("");
    setLoading(true);
    try {
      setEntries((await api<{ entries: Entry[] }>("/entries")).entries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    loadConfig()
      .then(async (c) => {
        if (!active) return;
        await finishSignIn();
        if (active) {
          setConfig(c);
          setAuthenticated(c.mode === "local" || !!accessToken());
        }
      })
      .catch((e) => {
        if (active) setConfigError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (config && authenticated) {
      void refresh();
      const timer = setInterval(() => {
        api<{ entries: Entry[] }>("/entries")
          .then((r) => setEntries(r.entries))
          .catch(() => {});
      }, 240000);
      return () => clearInterval(timer);
    }
  }, [config, authenticated]);
  useEffect(() => {
    const change = () =>
      setView(location.hash === "#photos" ? "photos" : "journal");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.title = `${view === "photos" ? "Photo album" : "Your journal"} · Corgi Note`;
  }, [view]);
  const filtered = entries.filter(
    (e) =>
      (!date || e.date === date) &&
      (activity === "All activities" || e.activity === activity) &&
      [e.title, e.body, e.dogName, e.activity]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const photos = filtered.flatMap((e) =>
    e.photos.map((p) => ({ entry: e, photo: p })),
  );
  function saved(e: Entry) {
    setEntries((es) =>
      [e, ...es.filter((x) => x.id !== e.id)].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    );
    setEditor(null);
    setStatus("Note saved. A little moment to treasure!");
  }
  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/entries/${deleting.id}?revision=${deleting.revision}`, {
        method: "DELETE",
      });
      setEntries((es) => es.filter((e) => e.id !== deleting.id));
      setDeleting(null);
      setStatus("Note deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }
  function exportJournal() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            entries.map((e) => ({
              ...e,
              photos: e.photos.map(({ key, alt }) => ({ key, alt })),
            })),
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `corgi-note-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Journal notes exported. Photo files are not included.");
  }
  if (configError)
    return (
      <main className="startup">
        <PawPrint size={38} />
        <h1>Let’s get your journal ready</h1>
        <p role="alert">{configError}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload
        </button>
        <button
          className="button secondary"
          onClick={() => signIn().catch((e) => setConfigError(e.message))}
        >
          Try signing in again
        </button>
      </main>
    );
  if (!config)
    return (
      <main className="startup">
        <PawPrint size={38} />
        <p role="status">Opening your little journal…</p>
      </main>
    );
  if (!authenticated)
    return (
      <main className="login">
        <div className="brand">
          <PawPrint />
          <span>
            Corgi Note<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="login-mascot">
          <Corgi />
        </div>
        <h1>
          Little notes,
          <br />
          happy tails.
        </h1>
        <p>
          A private journal for the walks, the wags, and everything in between.
        </p>
        <button
          className="button primary"
          onClick={() => signIn().catch((e) => setConfigError(e.message))}
        >
          Sign in or create an account <ArrowUpRight size={18} />
        </button>
        <small>
          <ShieldCheck size={15} /> Your notes and photos are private to your
          account.
        </small>
      </main>
    );
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to journal
      </a>
      <header className="site-header">
        <a className="brand" href="#journal" aria-label="Corgi Note home">
          <span className="brand-mark">
            <PawPrint size={24} />
          </span>
          Corgi Note
          <span className="brand-heart" aria-hidden="true">
            ♡
          </span>
        </a>
        <details className="journal-options">
          <summary aria-label="Journal options">
            <Ellipsis size={23} />
          </summary>
          <div className="options-panel">
            <p>
              {config.mode === "local"
                ? "Local demo · saved on this computer"
                : "Your private journal"}
            </p>
            <button onClick={exportJournal} disabled={!entries.length}>
              <Download size={17} />
              Export notes
            </button>
            {config.mode === "aws" && (
              <button onClick={signOut}>
                <LogOut size={17} />
                Sign out
              </button>
            )}
          </div>
        </details>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="welcome">
          <div className="welcome-copy">
            <span className="day-label">
              <Sun size={16} />
              {dateLabel(today(), {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <h1>
              Little notes,
              <br />
              <span>happy tails.</span>
            </h1>
            <p>A cozy little diary for your dog’s everyday adventures.</p>
            <button
              className="button primary add-note"
              onClick={() => setEditor({ entry: null })}
            >
              <Plus size={21} />
              Add a note
            </button>
          </div>
          <div className="mascot">
            <Corgi />
            <span className="mascot-caption">
              every day is a good dog day ♡
            </span>
          </div>
        </section>
        <section className="memory-section" aria-labelledby="memories-heading">
          <div className="journal-heading">
            <h2 id="memories-heading">
              {view === "journal" ? "Your memories" : "Your photos"}
            </h2>
            <nav className="view-switch" aria-label="Journal views">
              <a
                href="#journal"
                className={view === "journal" ? "active" : ""}
                aria-current={view === "journal" ? "page" : undefined}
              >
                <BookOpen size={17} />
                My journal
              </a>
              <a
                href="#photos"
                className={view === "photos" ? "active" : ""}
                aria-current={view === "photos" ? "page" : undefined}
              >
                <Images size={17} />
                Photos
              </a>
            </nav>
          </div>
          <div className="filter-bar">
            <label className="search">
              <Search size={18} />
              <span className="sr-only">Search memories</span>
              <input
                type="search"
                placeholder="Find a memory…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <details className="filter-options">
              <summary>
                <SlidersHorizontal size={17} />
                Filters
                {(date || activity !== "All activities") && (
                  <span className="filter-dot" aria-label="Filters applied" />
                )}
              </summary>
              <div className="filter-panel">
                <label>
                  Day
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  Activity
                  <select
                    value={activity}
                    onChange={(e) => setActivity(e.target.value)}
                  >
                    <option>All activities</option>
                    {activities.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    setDate("");
                    setActivity("All activities");
                  }}
                >
                  Reset filters
                </button>
              </div>
            </details>
          </div>
          {(date || activity !== "All activities") && (
            <div className="active-filters">
              <span>
                {date ? dateLabel(date) : "All days"} · {activity}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  setDate("");
                  setActivity("All activities");
                }}
              >
                Clear filters <X size={15} />
              </button>
            </div>
          )}
          <div className="sr-only" role="status">
            {status}
          </div>
          {status && (
            <div className="success">
              <span className="saved-heart" aria-hidden="true">
                <Heart size={20} />
              </span>
              {status}
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setStatus("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={refresh}>
                Try again
              </button>
              {config.mode === "aws" && (
                <button className="text-button" onClick={() => signIn()}>
                  Sign in again
                </button>
              )}
            </div>
          )}
          {loading ? (
            <div className="empty-state" role="status">
              <PawPrint size={30} />
              <p>Opening your little diary…</p>
            </div>
          ) : !filtered.length || (view === "photos" && !photos.length) ? (
            <div className="empty-state">
              <span className="empty-doodle" aria-hidden="true">
                {view === "photos" ? (
                  <Images size={30} />
                ) : (
                  <PawPrint size={32} />
                )}
                <Heart size={15} />
              </span>
              <h3>
                {search || date || activity !== "All activities"
                  ? "No memories found"
                  : view === "photos"
                    ? "Happy snaps belong here."
                    : "The first page is yours."}
              </h3>
              <p>
                {search || date || activity !== "All activities"
                  ? "Try another search or clear your filters."
                  : view === "photos"
                    ? "Add a photo to a note and it’ll appear in your album."
                    : "A funny moment, a little walk, a sleepy cuddle. What happened today?"}
              </p>
              {(search || date || activity !== "All activities") && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearch("");
                    setDate("");
                    setActivity("All activities");
                  }}
                >
                  Clear filters
                </button>
              )}
              <span className="empty-signoff">
                little moments, lots of love <span aria-hidden="true">♡</span>
              </span>
            </div>
          ) : view === "photos" ? (
            <div className="photo-grid">
              {photos.map(({ entry, photo }) => (
                <button
                  className="gallery-photo"
                  key={entry.id + "-" + photo.key}
                  onClick={() => setDetail(entry)}
                >
                  <img src={photo.url} alt={photo.alt} loading="lazy" />
                  <span>
                    {entry.dogName} ·{" "}
                    {dateLabel(entry.date, { day: "numeric", month: "short" })}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="entry-list">
              {filtered.map((e) => (
                <article className="entry-card" key={e.id}>
                  {e.photos[0] && (
                    <button
                      className="entry-photo"
                      aria-label={"Open " + e.title}
                      onClick={() => setDetail(e)}
                    >
                      <img
                        src={e.photos[0].url}
                        alt={e.photos[0].alt}
                        loading="lazy"
                      />
                      {e.photos.length > 1 && (
                        <span>
                          <Images size={14} />
                          {e.photos.length}
                        </span>
                      )}
                    </button>
                  )}
                  <div className="entry-copy">
                    <div className="entry-meta">
                      <span>
                        <PawPrint size={14} />
                        {e.dogName}
                      </span>
                      <time dateTime={e.date}>
                        {dateLabel(e.date, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    <h3>
                      <button onClick={() => setDetail(e)}>{e.title}</button>
                    </h3>
                    {e.body.trim() !== e.title && <p>{e.body}</p>}
                    <div className="entry-bottom">
                      <span className="memory-sticker" aria-hidden="true">
                        ♡ a day to keep
                      </span>
                      <button
                        className="text-button"
                        aria-label={"Edit " + e.title}
                        onClick={() => setEditor({ entry: e })}
                      >
                        <Pencil size={15} />
                        Edit note
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <footer className="page-footer">
          <PawPrint size={15} />
          <span>Made for paws and their people.</span>
          {config.mode === "local" && (
            <span className="local-label">Local demo</span>
          )}
        </footer>
      </main>
      {editor && (
        <Editor
          entry={editor.entry}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          <div className="detail-meta">
            <span>{detail.dogName}</span>
            <time dateTime={detail.date}>{dateLabel(detail.date)}</time>
            <span>
              {detail.activity} · {detail.mood}
            </span>
          </div>
          <p className="detail-body">{detail.body}</p>
          {detail.photos.length > 0 && (
            <div className="detail-photos">
              {detail.photos.map((p) => (
                <figure key={p.key}>
                  <img src={p.url} alt={p.alt} />
                  <figcaption>{p.alt}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <div className="form-footer">
            <button
              className="button danger"
              onClick={() => {
                setDeleting(detail);
                setDetail(null);
                setError("");
              }}
            >
              <Trash2 size={17} /> Delete note
            </button>
            <button
              className="button primary"
              onClick={() => {
                setEditor({ entry: detail });
                setDetail(null);
              }}
            >
              <Pencil size={17} /> Edit note
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Delete this note?"
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        >
          <p>
            “{deleting.title}” for {deleting.dogName},{" "}
            {dateLabel(deleting.date)}, will be deleted from your journal. This
            cannot be undone.
          </p>
          <p className="field-hint">
            Original photo files remain in private storage until storage
            maintenance. Export your notes first if you need a copy.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="form-footer">
            <button
              className="button secondary"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Keep note
            </button>
            <button
              className="button danger solid"
              disabled={deleteBusy}
              onClick={remove}
            >
              {deleteBusy ? "Deleting…" : "Delete note"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
