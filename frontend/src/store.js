// API에서 로드한 인맥 — App.jsx 전역 헬퍼(findC 등)가 참조
let clients = [];

export function setClients(list) {
  clients = list;
}

export function getClients() {
  return clients;
}
