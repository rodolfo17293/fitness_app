/* ==================================================================
   UTILIDADES DE FECHA / STORAGE
   ================================================================== */
function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return dateStr(new Date()); }

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

const KEY_PROGRESS = "ff_progress";
const KEY_PLAN = "ff_plan";
const KEY_HISTORY = "ff_history";
const KEY_WEIGHT = "ff_weight";
const KEY_WEIGH_PLAN = "ff_weigh_plan";
const KEY_CUSTOM_RUTINAS = "ff_rutinas_custom";
const KEY_CUSTOM_EXERCISES = "ff_custom_exercises";
const KEY_CUSTOM_DAYS = "ff_custom_days";

function loadCustomDays() { return loadJSON(KEY_CUSTOM_DAYS, {}); }
function saveCustomDays(data) { saveJSON(KEY_CUSTOM_DAYS, data); }

// Los días personalizados (ej. "Día C") empiezan vacíos, sin ejercicios
// propios; sus ejercicios se agregan igual que los de A/B (más abajo).
(function mergeCustomDays() {
  const customDays = loadCustomDays();
  Object.keys(customDays).forEach(key => {
    if (!RUTINAS[key]) {
      RUTINAS[key] = { titulo: customDays[key].titulo, subtitulo: "", ejercicios: [] };
    }
  });
})();

function nextDayLetter() {
  const used = Object.keys(RUTINAS);
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.includes(letter)) return letter;
  }
  return "D" + Date.now();
}

// Número de ejercicios originales de cada día, antes de agregar los
// personalizados. Los ejercicios agregados por el usuario siempre van
// después de estos, así que su índice nunca cambia entre recargas.
const BASE_EXERCISE_COUNT = {};
Object.keys(RUTINAS).forEach(day => { BASE_EXERCISE_COUNT[day] = RUTINAS[day].ejercicios.length; });

/* ==================================================================
   RUTINAS PERSONALIZADAS (series/reps editadas + ejercicios agregados
   por el usuario). Se guardan aparte y se aplican sobre RUTINAS al cargar.
   ================================================================== */
function loadCustomRutinas() { return loadJSON(KEY_CUSTOM_RUTINAS, {}); }
function saveCustomRutinas(data) { saveJSON(KEY_CUSTOM_RUTINAS, data); }
function loadCustomExercises() { return loadJSON(KEY_CUSTOM_EXERCISES, {}); }
function saveCustomExercises(data) { saveJSON(KEY_CUSTOM_EXERCISES, data); }

function applyCustomRutinas() {
  const custom = loadCustomRutinas();
  Object.keys(custom).forEach(day => {
    if (!RUTINAS[day]) return;
    (custom[day] || []).forEach((overrides, i) => {
      const ej = RUTINAS[day].ejercicios[i];
      if (!ej || !overrides) return;
      if (overrides.series != null) ej.series = overrides.series;
      if (overrides.reps != null) ej.reps = overrides.reps;
    });
  });

  const customExercises = loadCustomExercises();
  Object.keys(customExercises).forEach(day => {
    if (!RUTINAS[day]) return;
    (customExercises[day] || []).forEach(ej => RUTINAS[day].ejercicios.push({ ...ej }));
  });
}
applyCustomRutinas();

/* ==================================================================
   ESTADO: PROGRESO DE HOY (día, ejercicio actual, series marcadas)
   ================================================================== */
function getDefaultChecks() {
  const checks = {};
  for (const day of Object.keys(RUTINAS)) {
    checks[day] = RUTINAS[day].ejercicios.map(e => new Array(e.series).fill(false));
  }
  return checks;
}

function loadPlan() { return loadJSON(KEY_PLAN, {}); }
function savePlan(plan) { saveJSON(KEY_PLAN, plan); }
function loadHistory() { return loadJSON(KEY_HISTORY, {}); }
function saveHistory(h) { saveJSON(KEY_HISTORY, h); }
function loadWeights() { return loadJSON(KEY_WEIGHT, {}); }
function saveWeights(w) { saveJSON(KEY_WEIGHT, w); }
function loadWeighPlan() { return loadJSON(KEY_WEIGH_PLAN, {}); }
function saveWeighPlan(w) { saveJSON(KEY_WEIGH_PLAN, w); }

function loadProgress() {
  let p = loadJSON(KEY_PROGRESS, null);
  const today = todayStr();
  if (!p || p.date !== today) {
    const plan = loadPlan();
    p = {
      date: today,
      day: plan[today] || (p ? p.day : "A"),
      exerciseIndex: 0,
      checks: getDefaultChecks()
    };
    saveJSON(KEY_PROGRESS, p);
  }
  return p;
}
function saveProgress() { saveJSON(KEY_PROGRESS, progress); }

function syncProgressChecksWithRutinas() {
  let changed = false;
  Object.keys(RUTINAS).forEach(day => {
    RUTINAS[day].ejercicios.forEach((ej, i) => {
      const arr = progress.checks[day] && progress.checks[day][i];
      if (!arr || arr.length === ej.series) return;
      const newArr = new Array(ej.series).fill(false);
      for (let k = 0; k < Math.min(arr.length, ej.series); k++) newArr[k] = arr[k];
      progress.checks[day][i] = newArr;
      changed = true;
    });
  });
  if (changed) saveProgress();
}

let progress = loadProgress();
syncProgressChecksWithRutinas();

/* ==================================================================
   VISTA: RUTINA
   ================================================================== */
const topbarDayToggleEl = document.getElementById("topbar-day-toggle");
const exercisePosition = document.getElementById("exercise-position");
const exerciseName = document.getElementById("exercise-name");
const exerciseMeta = document.getElementById("exercise-meta");
const exerciseNote = document.getElementById("exercise-note");
const seriesGrid = document.getElementById("series-grid");
const seriesCounter = document.getElementById("series-counter");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const finishBtn = document.getElementById("finish-workout");
const finishToast = document.getElementById("finish-toast");

function currentRutina() { return RUTINAS[progress.day]; }
function currentEjercicio() { return currentRutina().ejercicios[progress.exerciseIndex]; }

function renderTopbarDayToggle() {
  topbarDayToggleEl.innerHTML = "";
  Object.keys(RUTINAS).sort().forEach(key => {
    const btn = document.createElement("button");
    btn.className = "day-btn" + (key === progress.day ? " active" : "");
    btn.dataset.day = key;
    btn.textContent = RUTINAS[key].titulo || `Día ${key}`;
    btn.addEventListener("click", () => {
      progress.day = key;
      progress.exerciseIndex = 0;
      saveProgress();
      renderRutina();
    });
    topbarDayToggleEl.appendChild(btn);
  });
}

function renderRutina() {
  renderTopbarDayToggle();

  const ejercicios = currentRutina().ejercicios;
  finishToast.classList.add("hidden");

  if (ejercicios.length === 0) {
    exercisePosition.textContent = "";
    exerciseName.textContent = "Sin ejercicios todavía";
    exerciseMeta.textContent = "";
    exerciseNote.textContent = "Agrega ejercicios a este día desde la pestaña Editar.";
    seriesGrid.innerHTML = "";
    seriesCounter.textContent = "";
    btnPrev.disabled = true;
    btnNext.disabled = true;
    finishBtn.disabled = true;
    return;
  }
  finishBtn.disabled = false;

  const ej = currentEjercicio();

  exercisePosition.textContent = `Ejercicio ${progress.exerciseIndex + 1} de ${ejercicios.length}`;
  exerciseName.textContent = ej.nombre;
  exerciseMeta.textContent = `${ej.series} series · ${ej.reps}`;
  exerciseNote.textContent = ej.nota;

  btnPrev.disabled = progress.exerciseIndex === 0;
  btnNext.disabled = progress.exerciseIndex === ejercicios.length - 1;

  renderSeries();
}

function renderSeries() {
  const checks = progress.checks[progress.day][progress.exerciseIndex];
  seriesGrid.innerHTML = "";
  checks.forEach((checked, i) => {
    const btn = document.createElement("button");
    btn.className = "series-check" + (checked ? " checked" : "");
    btn.textContent = checked ? "✓" : (i + 1);
    btn.addEventListener("click", () => {
      checks[i] = !checks[i];
      saveProgress();
      renderSeries();
    });
    seriesGrid.appendChild(btn);
  });
  const done = checks.filter(Boolean).length;
  seriesCounter.textContent = `${done} / ${checks.length} series`;
}

btnPrev.addEventListener("click", () => {
  if (progress.exerciseIndex > 0) {
    progress.exerciseIndex--;
    saveProgress();
    renderRutina();
  }
});
btnNext.addEventListener("click", () => {
  if (progress.exerciseIndex < currentRutina().ejercicios.length - 1) {
    progress.exerciseIndex++;
    saveProgress();
    renderRutina();
  }
});

let finishToastTimeout = null;
finishBtn.addEventListener("click", () => {
  const history = loadHistory();
  history[progress.date] = progress.day;
  saveHistory(history);
  finishToast.textContent = `✓ ¡Entrenamiento de ${RUTINAS[progress.day].titulo} registrado!`;
  finishToast.classList.remove("hidden");
  clearTimeout(finishToastTimeout);
  finishToastTimeout = setTimeout(() => finishToast.classList.add("hidden"), 2500);
  renderCalendar();
  renderTodayBanner();
});

/* ---------------- Foto de inspiración a pantalla completa ---------------- */
const btnInspiracion = document.getElementById("btn-inspiracion");
const inspirationOverlay = document.getElementById("inspiration-overlay");
btnInspiracion.addEventListener("click", () => inspirationOverlay.classList.remove("hidden"));
inspirationOverlay.addEventListener("click", () => inspirationOverlay.classList.add("hidden"));

/* ==================================================================
   NAVEGACIÓN ENTRE PESTAÑAS
   ================================================================== */
const navBtns = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");
const topbarDayToggle = document.getElementById("topbar-day-toggle");

navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    navBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.view;
    views.forEach(v => v.classList.toggle("active", v.id === `view-${target}`));
    topbarDayToggle.classList.toggle("hidden", target !== "rutina");
    if (target === "calendario") {
      renderCalendar();
      renderTodayBanner();
    } else if (target === "editar") {
      renderEditList();
    }
  });
});

/* ==================================================================
   VISTA: CALENDARIO
   ================================================================== */
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

let calViewYear, calViewMonth;
(function initCalCursor() {
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();
})();

const calMonthLabel = document.getElementById("cal-month-label");
const calendarGrid = document.getElementById("calendar-grid");
const todayBanner = document.getElementById("today-banner");

document.getElementById("cal-prev").addEventListener("click", () => {
  calViewMonth--;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calViewMonth++;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendar();
});

function renderTodayBanner() {
  const plan = loadPlan();
  const today = todayStr();
  const p = plan[today];
  const history = loadHistory();
  if (history[today]) {
    const titulo = RUTINAS[history[today]] ? RUTINAS[history[today]].titulo : `Día ${history[today]}`;
    todayBanner.textContent = `✓ Hoy ya completaste ${titulo}`;
  } else if (p) {
    const titulo = RUTINAS[p] ? RUTINAS[p].titulo : `Día ${p}`;
    todayBanner.textContent = `Hoy toca: ${titulo}`;
  } else {
    todayBanner.textContent = "Hoy no tienes un día planificado";
  }
}

function renderCalendar() {
  calMonthLabel.textContent = `${MESES[calViewMonth]} ${calViewYear}`;
  calendarGrid.innerHTML = "";

  const plan = loadPlan();
  const history = loadHistory();
  const weights = loadWeights();
  const weighPlan = loadWeighPlan();
  const today = todayStr();

  const firstDay = new Date(calViewYear, calViewMonth, 1);
  const startOffset = firstDay.getDay(); // 0 = domingo
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day empty";
    calendarGrid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateStr(new Date(calViewYear, calViewMonth, d));
    const cell = document.createElement("button");
    cell.className = "cal-day";
    if (ds === today) cell.classList.add("is-today");

    const dayNum = document.createElement("span");
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    if (history[ds]) {
      cell.classList.add("done");
      const tag = document.createElement("span");
      tag.className = "cal-tag";
      tag.textContent = history[ds];
      cell.appendChild(tag);
    } else if (plan[ds]) {
      cell.classList.add("planned");
      const tag = document.createElement("span");
      tag.className = "cal-tag";
      tag.textContent = plan[ds];
      cell.appendChild(tag);
    }

    if (weights[ds] != null) {
      const weightTag = document.createElement("span");
      weightTag.className = "cal-weight";
      weightTag.textContent = `${weights[ds]}kg`;
      cell.appendChild(weightTag);
    } else if (weighPlan[ds]) {
      const badge = document.createElement("span");
      badge.className = "cal-weigh-plan-badge";
      badge.textContent = "⚖️";
      cell.appendChild(badge);
    }

    cell.addEventListener("click", () => openDayModal(ds));
    calendarGrid.appendChild(cell);
  }
}

/* ---------------- MODAL: editar plan de un día ---------------- */
const dayModal = document.getElementById("day-modal");
const modalDate = document.getElementById("modal-date");
const modalStatus = document.getElementById("modal-status");
const modalPlanButtonsEl = document.getElementById("modal-plan-buttons");
const modalWeightInput = document.getElementById("modal-weight-input");
const modalWeightSaveBtn = document.getElementById("modal-weight-save");
let modalSelectedDate = null;

function handlePlanButtonClick(ds, value) {
  const plan = loadPlan();
  const current = plan[ds] || "";
  if (value === "" || value === current) {
    // "Sin plan", o volver a tocar el día ya seleccionado: deselecciona
    delete plan[ds];
  } else {
    plan[ds] = value;
  }
  savePlan(plan);
  renderModalPlanButtons(ds);
  renderCalendar();
  renderTodayBanner();
}

function renderModalPlanButtons(ds) {
  const plan = loadPlan();
  const weighPlan = loadWeighPlan();
  const current = plan[ds] || "";
  modalPlanButtonsEl.innerHTML = "";

  Object.keys(RUTINAS).sort().forEach(key => {
    const btn = document.createElement("button");
    btn.className = "modal-plan-btn" + (current === key ? " active" : "");
    btn.textContent = RUTINAS[key].titulo || `Día ${key}`;
    btn.addEventListener("click", () => handlePlanButtonClick(ds, key));
    modalPlanButtonsEl.appendChild(btn);
  });

  const noneBtn = document.createElement("button");
  noneBtn.className = "modal-plan-btn modal-plan-none" + (current === "" ? " active" : "");
  noneBtn.textContent = "Sin plan";
  noneBtn.addEventListener("click", () => handlePlanButtonClick(ds, ""));
  modalPlanButtonsEl.appendChild(noneBtn);

  const weighBtn = document.createElement("button");
  weighBtn.type = "button";
  weighBtn.className = "modal-plan-btn modal-weigh-plan-btn" + (weighPlan[ds] ? " active" : "");
  weighBtn.innerHTML = "&#9878;&#65039; Pesarme";
  weighBtn.addEventListener("click", () => {
    const wp = loadWeighPlan();
    if (wp[ds]) delete wp[ds]; else wp[ds] = true;
    saveWeighPlan(wp);
    renderModalPlanButtons(ds);
    renderCalendar();
  });
  modalPlanButtonsEl.appendChild(weighBtn);
}

function openDayModal(ds) {
  modalSelectedDate = ds;
  const dateObj = new Date(ds + "T00:00:00");
  modalDate.textContent = dateObj.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const history = loadHistory();
  const weights = loadWeights();

  if (history[ds]) {
    const tituloCompletado = RUTINAS[history[ds]] ? RUTINAS[history[ds]].titulo : `Día ${history[ds]}`;
    modalStatus.textContent = `Entrenamiento completado: ${tituloCompletado}`;
  } else {
    modalStatus.textContent = "Sin entrenamiento registrado";
  }

  renderModalPlanButtons(ds);
  modalWeightInput.value = weights[ds] != null ? weights[ds] : "";
  dayModal.classList.remove("hidden");
}

modalWeightSaveBtn.addEventListener("click", () => {
  const weights = loadWeights();
  const raw = modalWeightInput.value.trim();
  if (raw === "") {
    delete weights[modalSelectedDate];
  } else {
    const value = parseFloat(raw);
    if (!isNaN(value) && value > 0) {
      weights[modalSelectedDate] = value;
    }
  }
  saveWeights(weights);
  renderCalendar();
});

document.getElementById("modal-close").addEventListener("click", closeDayModal);
document.getElementById("modal-backdrop").addEventListener("click", closeDayModal);
function closeDayModal() { dayModal.classList.add("hidden"); }

/* ==================================================================
   VISTA: EDITAR RUTINAS
   ================================================================== */
let editDay = "A";
const editDayToggleEl = document.getElementById("edit-day-toggle");
const editExerciseList = document.getElementById("edit-exercise-list");

function renderEditDayToggle() {
  editDayToggleEl.innerHTML = "";
  Object.keys(RUTINAS).sort().forEach(key => {
    const btn = document.createElement("button");
    btn.className = "day-btn" + (key === editDay ? " active" : "");
    btn.dataset.day = key;
    btn.textContent = RUTINAS[key].titulo || `Día ${key}`;
    btn.addEventListener("click", () => {
      editDay = key;
      renderEditList();
    });
    editDayToggleEl.appendChild(btn);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "day-add-btn";
  addBtn.type = "button";
  addBtn.setAttribute("aria-label", "Agregar día");
  addBtn.textContent = "+";
  addBtn.addEventListener("click", openAddDayModal);
  editDayToggleEl.appendChild(addBtn);
}

function renderEditList() {
  renderEditDayToggle();
  editExerciseList.innerHTML = "";
  RUTINAS[editDay].ejercicios.forEach((ej, i) => {
    const item = document.createElement("button");
    item.className = "edit-exercise-item";

    const info = document.createElement("div");
    info.className = "edit-exercise-info";
    const name = document.createElement("span");
    name.className = "edit-exercise-name";
    name.textContent = ej.nombre;
    const detail = document.createElement("span");
    detail.className = "edit-exercise-detail";
    detail.textContent = `${ej.series} series · ${ej.reps}`;
    info.appendChild(name);
    info.appendChild(detail);

    const chevron = document.createElement("span");
    chevron.className = "edit-exercise-chevron";
    chevron.textContent = "›";

    item.appendChild(info);
    item.appendChild(chevron);
    item.addEventListener("click", () => {
      if (i < BASE_EXERCISE_COUNT[editDay]) {
        openExerciseEditModal(editDay, i);
      } else {
        openCustomExerciseModal(editDay, i);
      }
    });
    editExerciseList.appendChild(item);
  });
}

/* ---------------- MODAL: agregar día ---------------- */
const addDayModal = document.getElementById("add-day-modal");
const addDayNameInput = document.getElementById("add-day-name");

function openAddDayModal() {
  addDayNameInput.value = `Día ${nextDayLetter()}`;
  addDayModal.classList.remove("hidden");
}
function closeAddDayModal() { addDayModal.classList.add("hidden"); }

document.getElementById("add-day-close").addEventListener("click", closeAddDayModal);
document.getElementById("add-day-backdrop").addEventListener("click", closeAddDayModal);

document.getElementById("add-day-save").addEventListener("click", () => {
  const label = addDayNameInput.value.trim();
  if (!label) return;

  const key = nextDayLetter();
  RUTINAS[key] = { titulo: label, subtitulo: "", ejercicios: [] };
  BASE_EXERCISE_COUNT[key] = 0;
  progress.checks[key] = [];

  const customDays = loadCustomDays();
  customDays[key] = { titulo: label };
  saveCustomDays(customDays);
  saveProgress();

  editDay = key;
  renderEditList();
  closeAddDayModal();
});

/* ---------------- MODAL: editar series/reps de un ejercicio ---------------- */
const exerciseEditModal = document.getElementById("exercise-edit-modal");
const exerciseEditTitle = document.getElementById("exercise-edit-title");
const exerciseEditSeries = document.getElementById("exercise-edit-series");
const exerciseEditReps = document.getElementById("exercise-edit-reps");
let editingDay = null;
let editingIndex = null;

function openExerciseEditModal(day, index) {
  editingDay = day;
  editingIndex = index;
  const ej = RUTINAS[day].ejercicios[index];
  exerciseEditTitle.textContent = ej.nombre;
  exerciseEditSeries.value = ej.series;
  exerciseEditReps.value = ej.reps;
  exerciseEditModal.classList.remove("hidden");
}
function closeExerciseEditModal() { exerciseEditModal.classList.add("hidden"); }

document.getElementById("exercise-edit-close").addEventListener("click", closeExerciseEditModal);
document.getElementById("exercise-edit-backdrop").addEventListener("click", closeExerciseEditModal);

document.getElementById("exercise-edit-save").addEventListener("click", () => {
  const seriesVal = parseInt(exerciseEditSeries.value, 10);
  const repsVal = exerciseEditReps.value.trim();
  if (!seriesVal || seriesVal < 1 || !repsVal) return;

  const ej = RUTINAS[editingDay].ejercicios[editingIndex];
  ej.series = seriesVal;
  ej.reps = repsVal;

  const custom = loadCustomRutinas();
  if (!custom[editingDay]) custom[editingDay] = [];
  custom[editingDay][editingIndex] = { series: seriesVal, reps: repsVal };
  saveCustomRutinas(custom);

  syncProgressChecksWithRutinas();
  renderEditList();
  renderRutina();
  closeExerciseEditModal();
});

/* ---------------- MODAL: agregar / editar / eliminar ejercicio personalizado ---------------- */
const customExerciseModal = document.getElementById("custom-exercise-modal");
const customExerciseTitle = document.getElementById("custom-exercise-title");
const customExerciseName = document.getElementById("custom-exercise-name");
const customExerciseSeries = document.getElementById("custom-exercise-series");
const customExerciseReps = document.getElementById("custom-exercise-reps");
const customExerciseNota = document.getElementById("custom-exercise-nota");
const customExerciseDeleteBtn = document.getElementById("custom-exercise-delete");
let customExerciseEditingIndex = null; // null = agregando uno nuevo

function openCustomExerciseModal(day, index) {
  editDay = day;
  customExerciseEditingIndex = index;
  if (index == null) {
    customExerciseTitle.textContent = "Nuevo ejercicio";
    customExerciseName.value = "";
    customExerciseSeries.value = "";
    customExerciseReps.value = "";
    customExerciseNota.value = "";
    customExerciseDeleteBtn.classList.add("hidden");
  } else {
    const ej = RUTINAS[day].ejercicios[index];
    customExerciseTitle.textContent = ej.nombre;
    customExerciseName.value = ej.nombre;
    customExerciseSeries.value = ej.series;
    customExerciseReps.value = ej.reps;
    customExerciseNota.value = ej.nota || "";
    customExerciseDeleteBtn.classList.remove("hidden");
  }
  customExerciseModal.classList.remove("hidden");
}
function closeCustomExerciseModal() { customExerciseModal.classList.add("hidden"); }

document.getElementById("custom-exercise-close").addEventListener("click", closeCustomExerciseModal);
document.getElementById("custom-exercise-backdrop").addEventListener("click", closeCustomExerciseModal);
document.getElementById("btn-add-exercise").addEventListener("click", () => openCustomExerciseModal(editDay, null));

document.getElementById("custom-exercise-save").addEventListener("click", () => {
  const nombre = customExerciseName.value.trim();
  const seriesVal = parseInt(customExerciseSeries.value, 10);
  const reps = customExerciseReps.value.trim();
  const nota = customExerciseNota.value.trim();
  if (!nombre || !seriesVal || seriesVal < 1 || !reps) return;
  const ej = { nombre, series: seriesVal, reps, nota };

  const customExercises = loadCustomExercises();
  if (!customExercises[editDay]) customExercises[editDay] = [];

  if (customExerciseEditingIndex == null) {
    // Agregar: se suma al final, tanto en memoria como en el progreso de hoy.
    RUTINAS[editDay].ejercicios.push(ej);
    customExercises[editDay].push({ ...ej });
    if (!progress.checks[editDay]) progress.checks[editDay] = [];
    progress.checks[editDay].push(new Array(seriesVal).fill(false));
  } else {
    // Editar uno ya agregado antes.
    Object.assign(RUTINAS[editDay].ejercicios[customExerciseEditingIndex], ej);
    const customIndex = customExerciseEditingIndex - BASE_EXERCISE_COUNT[editDay];
    customExercises[editDay][customIndex] = { ...ej };
    syncProgressChecksWithRutinas();
  }

  saveCustomExercises(customExercises);
  saveProgress();
  renderEditList();
  renderRutina();
  closeCustomExerciseModal();
});

customExerciseDeleteBtn.addEventListener("click", () => {
  if (customExerciseEditingIndex == null) return;
  const index = customExerciseEditingIndex;
  const customIndex = index - BASE_EXERCISE_COUNT[editDay];
  if (customIndex < 0) return; // por seguridad: nunca borrar un ejercicio original

  RUTINAS[editDay].ejercicios.splice(index, 1);
  if (progress.checks[editDay]) progress.checks[editDay].splice(index, 1);

  const customExercises = loadCustomExercises();
  if (customExercises[editDay]) customExercises[editDay].splice(customIndex, 1);
  saveCustomExercises(customExercises);

  if (progress.day === editDay && progress.exerciseIndex >= RUTINAS[editDay].ejercicios.length) {
    progress.exerciseIndex = Math.max(0, RUTINAS[editDay].ejercicios.length - 1);
  }
  saveProgress();

  renderEditList();
  renderRutina();
  closeCustomExerciseModal();
});

/* ==================================================================
   TIMER: EMOM / HIIT / AMRAP
   ================================================================== */
const TIMER_DEFAULTS = {
  EMOM: { interval: 60, rounds: 10 },
  HIIT: { work: 40, rest: 20, rounds: 8 },
  AMRAP: { duration: 600 }
};

let timerType = "HIIT";
let timerSettings = JSON.parse(JSON.stringify(TIMER_DEFAULTS));
let timerState = null; // se inicializa con resetTimer()
let timerInterval = null;
let timerRunning = false;

const timerTypeBtn = document.getElementById("timer-type-btn");
const timerTypeDropdown = document.getElementById("timer-type-dropdown");
const timerSettingsBtn = document.getElementById("timer-settings-btn");
const timerBigDisplay = document.getElementById("timer-big-display");
const timerStatusLine = document.getElementById("timer-status-line");
const timerPhase = document.getElementById("timer-phase");
const timerRounds = document.getElementById("timer-rounds");
const timerAmrapCounter = document.getElementById("timer-amrap-counter");
const amrapRoundsEl = document.getElementById("amrap-rounds");
const timerSettingsEl = document.getElementById("timer-settings");
const timerPlayBtn = document.getElementById("timer-play");
const timerResetBtn = document.getElementById("timer-reset");

function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { /* Web Audio no disponible */ }
}

function beep() {
  try {
    unlockAudio();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) { /* silencioso si el navegador bloquea audio */ }
  if (navigator.vibrate) navigator.vibrate(150);
}

function resetTimer() {
  pauseTimer();
  if (timerType === "EMOM") {
    timerState = { round: 1, remaining: timerSettings.EMOM.interval };
  } else if (timerType === "HIIT") {
    timerState = { round: 1, phase: "Trabajo", remaining: timerSettings.HIIT.work };
  } else if (timerType === "AMRAP") {
    timerState = { remaining: timerSettings.AMRAP.duration, rounds: 0, finished: false };
  }
  renderTimer();
}

function tickTimer() {
  if (timerType === "EMOM") {
    const cfg = timerSettings.EMOM;
    timerState.remaining--;
    if (timerState.remaining < 0) {
      if (timerState.round >= cfg.rounds) { pauseTimer(); timerState.remaining = 0; renderTimer(); return; }
      timerState.round++;
      timerState.remaining = cfg.interval;
      beep();
    }
  } else if (timerType === "HIIT") {
    const cfg = timerSettings.HIIT;
    timerState.remaining--;
    if (timerState.remaining < 0) {
      if (timerState.phase === "Trabajo") {
        timerState.phase = "Descanso";
        timerState.remaining = cfg.rest;
      } else {
        if (timerState.round >= cfg.rounds) { pauseTimer(); timerState.remaining = 0; renderTimer(); return; }
        timerState.round++;
        timerState.phase = "Trabajo";
        timerState.remaining = cfg.work;
      }
      beep();
    }
  } else if (timerType === "AMRAP") {
    timerState.remaining--;
    if (timerState.remaining <= 0) {
      timerState.remaining = 0;
      timerState.finished = true;
      pauseTimer();
      beep();
    }
  }
  renderTimer();
}

function playTimer() {
  if (timerRunning) return;
  if (timerType === "AMRAP" && timerState.finished) return;
  unlockAudio(); // crea/reactiva el audio en este gesto del usuario (necesario en iOS/Android)
  timerRunning = true;
  timerPlayBtn.innerHTML = "&#10074;&#10074;";
  timerInterval = setInterval(tickTimer, 1000);
}
function pauseTimer() {
  timerRunning = false;
  if (timerPlayBtn) timerPlayBtn.innerHTML = "&#9658;";
  clearInterval(timerInterval);
  timerInterval = null;
}
function toggleTimerPlay() { timerRunning ? pauseTimer() : playTimer(); }

function renderTimer() {
  let display, phaseText, roundsText;
  if (timerType === "EMOM") {
    display = fmtTime(timerState.remaining);
    phaseText = "EMOM";
    roundsText = `Ronda ${timerState.round} / ${timerSettings.EMOM.rounds}`;
    timerStatusLine.classList.remove("hidden");
    timerAmrapCounter.classList.add("hidden");
  } else if (timerType === "HIIT") {
    display = fmtTime(timerState.remaining);
    phaseText = timerState.phase;
    roundsText = `Ronda ${timerState.round} / ${timerSettings.HIIT.rounds}`;
    timerStatusLine.classList.remove("hidden");
    timerAmrapCounter.classList.add("hidden");
  } else {
    display = timerState.finished ? "¡Listo!" : fmtTime(timerState.remaining);
    phaseText = "AMRAP";
    roundsText = "";
    timerStatusLine.classList.add("hidden");
    timerAmrapCounter.classList.remove("hidden");
    amrapRoundsEl.textContent = timerState.rounds;
  }
  timerBigDisplay.textContent = display;
  timerPhase.textContent = phaseText;
  timerRounds.textContent = roundsText;
}

function renderTimerSettings() {
  timerSettingsEl.innerHTML = "";
  const rows = [];
  if (timerType === "EMOM") {
    rows.push({ label: "Intervalo (s)", key: "interval", store: timerSettings.EMOM, step: 5, min: 10 });
    rows.push({ label: "Rondas", key: "rounds", store: timerSettings.EMOM, step: 1, min: 1 });
  } else if (timerType === "HIIT") {
    rows.push({ label: "Trabajo (s)", key: "work", store: timerSettings.HIIT, step: 5, min: 5 });
    rows.push({ label: "Descanso (s)", key: "rest", store: timerSettings.HIIT, step: 5, min: 5 });
    rows.push({ label: "Rondas", key: "rounds", store: timerSettings.HIIT, step: 1, min: 1 });
  } else if (timerType === "AMRAP") {
    rows.push({ label: "Duración (s)", key: "duration", store: timerSettings.AMRAP, step: 30, min: 30 });
  }

  rows.forEach(row => {
    const rowEl = document.createElement("div");
    rowEl.className = "timer-setting-row";

    const label = document.createElement("span");
    label.textContent = row.label;

    const stepper = document.createElement("div");
    stepper.className = "stepper";

    const minus = document.createElement("button");
    minus.className = "stepper-btn";
    minus.textContent = "−";
    minus.addEventListener("click", () => {
      row.store[row.key] = Math.max(row.min, row.store[row.key] - row.step);
      resetTimer();
      renderTimerSettings();
    });

    const value = document.createElement("span");
    value.className = "stepper-value";
    value.textContent = row.store[row.key];

    const plus = document.createElement("button");
    plus.className = "stepper-btn";
    plus.textContent = "+";
    plus.addEventListener("click", () => {
      row.store[row.key] += row.step;
      resetTimer();
      renderTimerSettings();
    });

    stepper.appendChild(minus);
    stepper.appendChild(value);
    stepper.appendChild(plus);
    rowEl.appendChild(label);
    rowEl.appendChild(stepper);
    timerSettingsEl.appendChild(rowEl);
  });
}

function setTimerType(type) {
  timerType = type;
  timerTypeBtn.innerHTML = `${type} <span class="caret">&#9662;</span>`;
  timerTypeDropdown.classList.add("hidden");
  resetTimer();
  renderTimerSettings();
}

function positionFixedPopover(popover, anchor, align) {
  const rect = anchor.getBoundingClientRect();
  popover.style.top = (rect.bottom + 6) + "px";
  if (align === "right") {
    popover.style.right = (window.innerWidth - rect.right) + "px";
    popover.style.left = "auto";
  } else {
    popover.style.left = rect.left + "px";
    popover.style.right = "auto";
  }
}

timerTypeBtn.addEventListener("click", () => {
  timerSettingsEl.classList.add("hidden");
  const opening = timerTypeDropdown.classList.contains("hidden");
  if (opening) positionFixedPopover(timerTypeDropdown, timerTypeBtn, "left");
  timerTypeDropdown.classList.toggle("hidden");
});
timerTypeDropdown.querySelectorAll("button").forEach(btn => {
  btn.addEventListener("click", () => setTimerType(btn.dataset.type));
});

timerSettingsBtn.addEventListener("click", () => {
  timerTypeDropdown.classList.add("hidden");
  const opening = timerSettingsEl.classList.contains("hidden");
  if (opening) positionFixedPopover(timerSettingsEl, timerSettingsBtn, "right");
  timerSettingsEl.classList.toggle("hidden");
});

timerPlayBtn.addEventListener("click", toggleTimerPlay);
timerResetBtn.addEventListener("click", resetTimer);

document.getElementById("amrap-plus").addEventListener("click", () => {
  timerState.rounds++;
  renderTimer();
});
document.getElementById("amrap-minus").addEventListener("click", () => {
  timerState.rounds = Math.max(0, timerState.rounds - 1);
  renderTimer();
});

/* ==================================================================
   LAYOUT: alto real del header y del nav inferior
   (para que la vista Rutina encaje exacto en 3 tercios sin scroll)
   ================================================================== */
function updateChromeHeights() {
  const topbar = document.querySelector(".topbar");
  const bottomNav = document.querySelector(".bottom-nav");
  document.documentElement.style.setProperty("--topbar-h", topbar.getBoundingClientRect().height + "px");
  document.documentElement.style.setProperty("--bottomnav-h", bottomNav.getBoundingClientRect().height + "px");
}
window.addEventListener("resize", updateChromeHeights);

/* ==================================================================
   INICIALIZACIÓN
   ================================================================== */
renderRutina();
renderCalendar();
renderTodayBanner();
renderEditList();
setTimerType("HIIT");
updateChromeHeights();
