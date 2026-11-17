import React from 'react';
import {PULSO_BOT_SUGGESTIONS} from '../telegram/bot-chat-profiles';
import './bot-providers.css';

/** Presentation DTO only. Profile identity is not musical compatibility. */
export interface BotProviderRowView {
  id: string;
  username: string;
  label: string;
  profileStatus: 'verified' | 'unverified' | 'unavailable';
  compatibility: 'unverified' | 'unsupported';
}

export interface BotProvidersPanelProps {
  rows: readonly BotProviderRowView[];
  revision: number;
  pending: boolean;
  canEdit: boolean;
  scopeKey: string;
  /** Non-reviving authority captured by the parent for this render. */
  current: () => boolean;
  error: string | null;
  notice?: string | null;
  onAdd: (input: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onRemove: (id: string) => void;
  /** Parent captures the exact operation; cancellation does not require fresh authority. */
  onCancel?: () => void;
}

const suggestions = PULSO_BOT_SUGGESTIONS;
const profileLabels = {
  verified: 'Perfil comprobado',
  unverified: 'Perfil sin comprobar',
  unavailable: 'Perfil no disponible',
};
type FocusIntent = {
  id: string;
  kind: 'up' | 'down' | 'remove';
  index: number;
  revision: number;
  waited: boolean;
  error: string | null;
  origin: HTMLButtonElement;
  current: () => boolean;
  stop: () => void;
};

/** scopeKey resets draft/focus synchronously and retires old render callbacks. */
export function BotProvidersPanel(props: BotProvidersPanelProps) {
  return <BotProvidersPanelScope key={props.scopeKey} {...props} />;
}

function BotProvidersPanelScope(props: BotProvidersPanelProps) {
  const {rows, revision, pending, canEdit, scopeKey, current, error, notice,
    onAdd, onMove, onRemove, onCancel} = props;
  const [draft, setDraft] = React.useState('');
  const input = React.useRef<HTMLInputElement>(null);
  const section = React.useRef<HTMLElement>(null);
  const live = React.useRef(false);
  const committed = React.useRef({revision, canEdit, pending, scopeKey});
  const intent = React.useRef<FocusIntent | null>(null);
  const inputId = React.useId();
  const helpId = React.useId();
  const limitId = React.useId();
  const enabled = canEdit && !pending;
  const full = rows.length >= 5;

  const clearIntent = () => {
    intent.current?.stop();
    intent.current = null;
  };
  React.useLayoutEffect(() => {
    live.current = true;
    return () => { live.current = false; clearIntent(); };
  }, []);
  React.useLayoutEffect(() => {
    committed.current = {revision, canEdit, pending, scopeKey};
    const saved = intent.current;
    if (!saved) return;
    if (pending) { saved.waited = true; return; }
    if (revision === saved.revision) {
      if (saved.waited || saved.error !== error) clearIntent();
      return;
    }
    // ACK can retire the action capture. Only that original capture may allow focus.
    const doc = section.current?.ownerDocument;
    const active = doc?.activeElement;
    // React may detach/reinsert a keyed row while moving it, leaving body focused.
    const untouched = active === saved.origin || active === doc?.body;
    if (canEdit && saved.current() && untouched) {
      const rowElements = Array.from(section.current?.querySelectorAll<HTMLElement>('[data-bot-row]') ?? []);
      if (saved.kind === 'remove' && !rows.some(row => row.id === saved.id)) {
        const next = rowElements[Math.min(saved.index, rowElements.length - 1)];
        const target = next?.querySelector<HTMLButtonElement>('[data-bot-action="remove"]');
        (target ?? input.current)?.focus();
      } else if (saved.kind !== 'remove') {
        const row = rowElements.find(element => element.dataset.botRow === saved.id);
        const same = row?.querySelector<HTMLButtonElement>(`[data-bot-action="${saved.kind}"]`);
        const other = row?.querySelector<HTMLButtonElement>(`[data-bot-action="${saved.kind === 'up' ? 'down' : 'up'}"]`);
        const remove = row?.querySelector<HTMLButtonElement>('[data-bot-action="remove"]');
        (same && !same.disabled ? same : other && !other.disabled ? other : remove)?.focus();
      }
    }
    clearIntent();
  }, [rows, revision, pending, canEdit, scopeKey, error]);

  // Capture current from this render, never replace it with a newer closure at use.
  const allowed = () => live.current && canEdit && !pending && current() &&
    committed.current.canEdit && !committed.current.pending &&
    committed.current.revision === revision && committed.current.scopeKey === scopeKey;

  const rememberFocus = (id: string, index: number, kind: FocusIntent['kind'], origin: HTMLButtonElement) => {
    clearIntent();
    const doc = origin.ownerDocument;
    // Listeners exist only for this user action, never as a mount side effect.
    const abandon = () => clearIntent();
    const focus = (event: FocusEvent) => { if (event.target !== origin) abandon(); };
    const stop = () => {
      doc.removeEventListener('pointerdown', abandon, true);
      doc.removeEventListener('keydown', abandon, true);
      doc.removeEventListener('focusin', focus, true);
    };
    intent.current = {id, index, kind, revision, waited: false, error, origin, current, stop};
    doc.addEventListener('pointerdown', abandon, true);
    doc.addEventListener('keydown', abandon, true);
    doc.addEventListener('focusin', focus, true);
  };

  return <section ref={section} className="bot-providers" aria-label="Bots de música" aria-busy={pending}>
    <h3>Bots de música</h3>
    <p>Elige hasta 5 bots, en el orden de búsqueda. No necesitas canales.</p>
    <p>Pulso prepara KD y Deezer al conectar Telegram por primera vez. Puedes quitarlos, cambiar el orden o añadir otros; se conserva tu elección.</p>
    {rows.length === 0 && <p>Aún no has añadido bots. Escribe un @usuario o elige una sugerencia para empezar.</p>}
    <ol className="bot-providers-list" aria-label="Orden de búsqueda de bots">
      {rows.map((row, index) => <li key={row.id} data-bot-row={row.id}>
        <p className="bot-providers-priority">{index === 0 ? 'Principal' : index === 1 ? 'Secundario' : `${index + 1}.º`}</p>
        <p className="bot-providers-name"><bdi dir="auto">{row.label}</bdi> <bdi dir="auto">@{row.username}</bdi></p>
        <p>{profileLabels[row.profileStatus]}. {row.compatibility === 'unsupported' ? 'Búsqueda musical no compatible.' : 'Búsqueda musical sin comprobar.'}</p>
        <div className="bot-providers-actions">
          <button type="button" data-bot-action="up" aria-label={`Subir @${row.username}`} disabled={!enabled || index === 0}
            onClick={event => { if (!allowed() || index === 0) return; rememberFocus(row.id, index, 'up', event.currentTarget); onMove(row.id, 'up'); }}>Subir</button>
          <button type="button" data-bot-action="down" aria-label={`Bajar @${row.username}`} disabled={!enabled || index === rows.length - 1}
            onClick={event => { if (!allowed() || index >= rows.length - 1) return; rememberFocus(row.id, index, 'down', event.currentTarget); onMove(row.id, 'down'); }}>Bajar</button>
          <button type="button" data-bot-action="remove" aria-label={`Quitar @${row.username}`} disabled={!enabled}
            onClick={event => { if (!allowed()) return; rememberFocus(row.id, index, 'remove', event.currentTarget); onRemove(row.id); }}>Quitar</button>
        </div>
      </li>)}
    </ol>
    <p>Sugeridos por Pulso. También puedes añadir otros bots y cambiar su prioridad.</p>
    <p>Elegir una sugerencia sólo rellena el campo; pulsa «Comprobar y añadir» para añadirla.</p>
    <div className="bot-providers-actions" aria-label="Sugerencias de bots">
      {suggestions.map(username => <button type="button" key={username} disabled={!enabled}
        aria-label={`Usar sugerencia @${username}`} onClick={() => {
          if (!allowed()) return;
          setDraft(`@${username}`);
          input.current?.focus();
        }}>@{username}</button>)}
    </div>
    <form className="bot-providers-form" onSubmit={event => {
      event.preventDefault();
      if (!allowed() || full || !draft.trim()) return;
      clearIntent();
      onAdd(draft.trim());
    }}>
      <label htmlFor={inputId}>@usuario o enlace público de Telegram</label>
      <input ref={input} id={inputId} type="text" value={draft} maxLength={512} autoComplete="off" autoCapitalize="none" spellCheck={false}
        disabled={!enabled} aria-describedby={`${helpId} ${limitId}`} onChange={event => { if (allowed()) setDraft(event.target.value); }} />
      <p id={helpId}>Al pulsar Comprobar y añadir se consultará el perfil en Telegram y se añadirá si es válido. No se iniciará el bot ni se enviarán mensajes o canciones. Comprobar perfil no prueba la búsqueda musical.</p>
      <p id={limitId}>{full ? 'Has alcanzado el límite de 5 bots. Quita uno para añadir otro.' : `${rows.length} de 5 bots añadidos. Puedes usar menos de 5.`}</p>
      <button type="submit" disabled={!enabled || full || !draft.trim()}>Comprobar y añadir</button>
    </form>
    <p>Reordenar o quitar sólo afecta a futuras consultas e invalida los resultados anteriores. No borra chats ni canciones.</p>
    <p role="status">{pending ? 'Aplicando el cambio…' : notice ?? ''}</p>
    {error && <p role="alert">{error}</p>}
    {pending && onCancel && <button type="button" onClick={() => { if (live.current) { clearIntent(); onCancel(); } }}>Cancelar cambio</button>}
  </section>;
}
