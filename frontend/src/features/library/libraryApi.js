// Serviço compartilhado da Minha Biblioteca (Protocolo 05). Toda tela que adiciona,
// favorita, acompanha ou lista obras passa por aqui; depois de cada alteração o evento
// "nk:personal" avisa as demais telas abertas (Header, Home, Conta...) para recarregar.
import { api } from "../../services/api";

const notify = () => window.dispatchEvent(new Event("nk:personal"));

/** Itens chegam com o UUID público em id; as telas do design usam o id numérico. */
const normalize = (x) => ({ ...x, publicId: x.id, id: x.legacyId ?? x.id });

async function change(promise) {
  const value = await promise;
  notify();
  return value;
}

export const libraryApi = {
  async list(params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    const page = await api.get(`/api/v1/me/library?${q}`);
    return { ...page, items: page.items.map(normalize) };
  },
  summary: () => api.get("/api/v1/me/library/summary"),
  /** workRef: UUID público ou id numérico da obra. */
  state: (workRef) => api.get(`/api/v1/me/library/${workRef}`),
  setStatus: (workRef, status) => change(api.put(`/api/v1/me/library/${workRef}`, { status })),
  remove: (workRef) => change(api.del(`/api/v1/me/library/${workRef}`)),
  favorite: (workRef, on) =>
    change(on ? api.put(`/api/v1/me/favorites/${workRef}`) : api.del(`/api/v1/me/favorites/${workRef}`)),
  follow: (workRef, on) =>
    change(on ? api.put(`/api/v1/me/follows/${workRef}`) : api.del(`/api/v1/me/follows/${workRef}`)),
  async favorites(params = {}) {
    const page = await api.get(`/api/v1/me/favorites?${new URLSearchParams(params)}`);
    return { ...page, items: page.items.map(normalize) };
  },
  follows: () => api.get("/api/v1/me/follows"),
};
