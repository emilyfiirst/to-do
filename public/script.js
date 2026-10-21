const STATUSES = ["novo", "iniciado", "concluido"];
const STATUS_LABELS = { novo: "Novo", iniciado: "Iniciado", concluido: "Concluído" };

const segmentList = document.getElementById("segment-list");
const segmentForm = document.getElementById("segment-form");
const segmentNameInput = document.getElementById("segment-name");

const emptyState = document.getElementById("empty-state");
const segmentView = document.getElementById("segment-view");
const segmentTitle = document.getElementById("segment-title");
const deleteSegmentBtn = document.getElementById("delete-segment");

const itemForm = document.getElementById("item-form");
const itemTitleInput = document.getElementById("item-title");

const columnLists = Object.fromEntries(
  STATUSES.map((status) => [status, document.getElementById(`list-${status}`)])
);
const columnCounts = Object.fromEntries(
  STATUSES.map((status) => [status, document.getElementById(`count-${status}`)])
);

let activeSegmentId = null;
let segments = [];

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Erro na requisição");
  }
  return res.status === 204 ? null : res.json();
}

function formatDateTime(isoLike) {
  const date = new Date(isoLike.replace(" ", "T"));
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadSegments() {
  segments = await api("/api/segments");
  renderSegments();
}

function renderSegments() {
  segmentList.innerHTML = "";
  for (const segment of segments) {
    const li = document.createElement("li");
    li.dataset.id = segment.id;
    li.className = segment.id === activeSegmentId ? "active" : "";

    const name = document.createElement("span");
    name.textContent = segment.name;

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = segment.item_count;

    li.append(name, count);
    li.addEventListener("click", () => selectSegment(segment.id));
    segmentList.appendChild(li);
  }
}

async function selectSegment(id) {
  activeSegmentId = id;
  renderSegments();

  const segment = segments.find((s) => s.id === id);
  segmentTitle.textContent = segment.name;
  emptyState.classList.add("hidden");
  segmentView.classList.remove("hidden");

  await loadItems();
}

async function loadItems() {
  const items = await api(`/api/segments/${activeSegmentId}/items`);
  renderItems(items);
}

async function updateItemStatus(id, status) {
  await api(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  await loadItems();
  await loadSegments();
}

for (const status of STATUSES) {
  const column = columnLists[status];
  column.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    column.classList.add("drag-over");
  });
  column.addEventListener("dragleave", () => {
    column.classList.remove("drag-over");
  });
  column.addEventListener("drop", (e) => {
    e.preventDefault();
    column.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    if (id) updateItemStatus(Number(id), status);
  });
}

function renderItems(items) {
  for (const status of STATUSES) {
    columnLists[status].innerHTML = "";
  }

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, []]));
  for (const item of items) {
    (byStatus[item.status] || byStatus.novo).push(item);
  }

  for (const status of STATUSES) {
    columnCounts[status].textContent = byStatus[status].length;

    if (byStatus[status].length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-column";
      empty.textContent = "Vazio";
      columnLists[status].appendChild(empty);
      continue;
    }

    for (const item of byStatus[status]) {
      columnLists[status].appendChild(renderItemCard(item));
    }
  }
}

function renderItemCard(item) {
  const li = document.createElement("li");
  li.draggable = true;
  li.dataset.id = item.id;

  li.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(item.id));
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
  });

  const body = document.createElement("div");
  body.className = "item-body";

  const title = document.createElement("span");
  title.className = "item-title";
  title.textContent = item.title;

  const date = document.createElement("span");
  date.className = "item-date";
  date.textContent = `Adicionado em ${formatDateTime(item.created_at)}`;

  body.append(title, date);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const statusIndex = STATUSES.indexOf(item.status);

  const moveLeft = document.createElement("button");
  moveLeft.className = "item-move";
  moveLeft.textContent = "←";
  moveLeft.title = statusIndex > 0 ? `Mover para ${STATUS_LABELS[STATUSES[statusIndex - 1]]}` : "";
  moveLeft.disabled = statusIndex === 0;
  moveLeft.addEventListener("click", () => updateItemStatus(item.id, STATUSES[statusIndex - 1]));

  const moveRight = document.createElement("button");
  moveRight.className = "item-move";
  moveRight.textContent = "→";
  moveRight.title =
    statusIndex < STATUSES.length - 1 ? `Mover para ${STATUS_LABELS[STATUSES[statusIndex + 1]]}` : "";
  moveRight.disabled = statusIndex === STATUSES.length - 1;
  moveRight.addEventListener("click", () => updateItemStatus(item.id, STATUSES[statusIndex + 1]));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "item-delete";
  deleteBtn.textContent = "✕";
  deleteBtn.addEventListener("click", async () => {
    await api(`/api/items/${item.id}`, { method: "DELETE" });
    await loadItems();
    await loadSegments();
  });

  actions.append(moveLeft, moveRight, deleteBtn);
  li.append(body, actions);
  return li;
}

segmentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = segmentNameInput.value.trim();
  if (!name) return;
  try {
    await api("/api/segments", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    segmentNameInput.value = "";
    await loadSegments();
  } catch (err) {
    alert(err.message);
  }
});

deleteSegmentBtn.addEventListener("click", async () => {
  if (!activeSegmentId) return;
  const segment = segments.find((s) => s.id === activeSegmentId);
  if (!confirm(`Excluir o segmento "${segment.name}" e todos os seus itens?`)) return;

  await api(`/api/segments/${activeSegmentId}`, { method: "DELETE" });
  activeSegmentId = null;
  segmentView.classList.add("hidden");
  emptyState.classList.remove("hidden");
  await loadSegments();
});

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = itemTitleInput.value.trim();
  if (!title || !activeSegmentId) return;
  try {
    await api(`/api/segments/${activeSegmentId}/items`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    itemTitleInput.value = "";
    await loadItems();
    await loadSegments();
  } catch (err) {
    alert(err.message);
  }
});

loadSegments();
