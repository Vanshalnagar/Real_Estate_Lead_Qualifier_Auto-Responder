import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface ChatOpenOptions {
  /** Text placed in the input (user can edit before sending). */
  prefill?: string;
  /** Listing the customer is asking about — sent with each message as context. */
  property?: { slug: string; title: string } | null;
  /** Message to send immediately when the panel opens (hero AI search bar). */
  send?: string;
}

interface ChatCtx {
  open: boolean;
  options: ChatOpenOptions;
  openChat: (o?: ChatOpenOptions) => void;
  closeChat: () => void;
}

const Ctx = createContext<ChatCtx | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ChatOpenOptions>({});
  const openChat = useCallback((o: ChatOpenOptions = {}) => {
    setOptions((prev) => ({ prefill: o.prefill, send: o.send, property: o.property === undefined ? prev.property : o.property }));
    setOpen(true);
  }, []);
  const closeChat = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, options, openChat, closeChat }), [open, options, openChat, closeChat]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChat outside ChatProvider');
  return c;
}
