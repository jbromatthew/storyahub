// API에서 로드한 인맥 — App.jsx 전역 헬퍼(findC 등)가 참조
let clients = [];
let places = [];

export function setClients(list) {
  clients = list;
}

export function getClients() {
  return clients;
}

export function setPlaces(list) {
  places = list;
}

export function getPlaces() {
  return places;
}
