// Histórico (Protocolo 05): linha do tempo separada do progresso.
import { api } from "../../services/api";

import { activityLabel, groupHistory } from "./groupHistory.js";

export { activityLabel, groupHistory };

const notify = () => window.dispatchEvent(new Event("nk:personal"));

export const historyApi = {
  async page(params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    return api.get(`/api/v1/me/history?${q}`);
  },
  async list(params = { size: 100 }) {
    const page = await this.page(params);
    return groupHistory(page.items);
  },
  async remove(id) {
    const r = await api.del(`/api/v1/me/history/${id}`);
    notify();
    return r;
  },
  async clear() {
    const r = await api.del("/api/v1/me/history");
    notify();
    return r;
  },
};
