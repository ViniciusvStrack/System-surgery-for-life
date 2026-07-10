export function normalize(text = "") {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function tokens(text) {
  return new Set(normalize(text).replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((x) => x.length > 1));
}

export function makeOrderId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `PED-${date}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}
