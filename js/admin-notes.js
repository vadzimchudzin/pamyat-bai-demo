/* ПАМЯТЬ.БАЙ — админка: общие заметки команды. Подключается после admin.js. */
(function () {
  'use strict';
  var K = window.AdminKit;
  var $ = K.$, $$ = K.$$, esc = K.esc, toast = K.toast, api = K.api;
  var NOTES = [], activeNoteId = null, activeNoteVersion = 0, noteDirty = false;

  function noteDate(value) {
    var d = value ? new Date(value) : null;
    return d && !isNaN(d.getTime()) ? d.toLocaleString('ru-RU') : '—';
  }
  function renderNotesList() {
    var box = $('#notesList');
    if (!NOTES.length) {
      box.innerHTML = '<p class="empty">Пока нет заметок. Создайте первую запись для команды.</p>';
      return;
    }
    box.innerHTML = NOTES.map(function (n) {
      return '<button type="button" class="notes-list-item' + (Number(n.id) === Number(activeNoteId) ? ' on' : '') + '" data-note-open="' + Number(n.id) + '">' +
        '<b>' + esc(n.title || 'Без названия') + '</b>' +
        '<small>Изменено: ' + esc(noteDate(n.updated_at)) + '</small>' +
        '<small>Автор: ' + esc(n.updated_by || n.created_by || '—') + '</small>' +
      '</button>';
    }).join('');
  }
  function showNoteEditor(note) {
    if (!note) {
      activeNoteId = null;
      activeNoteVersion = 0;
      noteDirty = false;
      $('#noteEditor').hidden = true;
      $('#notesEmpty').hidden = false;
      $('#noteReloadLatest').hidden = true;
      renderNotesList();
      return;
    }
    activeNoteId = Number(note.id);
    activeNoteVersion = Number(note.version || 1);
    noteDirty = false;
    $('#noteTitle').value = note.title || '';
    $('#noteBody').value = note.body || '';
    $('#noteMeta').textContent = 'Последнее изменение: ' + noteDate(note.updated_at) + ' · ' + (note.updated_by || note.created_by || 'неизвестно');
    $('#noteReloadLatest').hidden = true;
    $('#noteEditor').hidden = false;
    $('#notesEmpty').hidden = true;
    renderNotesList();
  }
  function loadNotes() {
    return api('/api/notes').then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось загрузить заметки', true);
      NOTES = Array.isArray(d.notes) ? d.notes : [];
      var current = NOTES.find(function (n) { return Number(n.id) === Number(activeNoteId); });
      renderNotesList();
      if (!activeNoteId) return;
      if (!current) {
        showNoteEditor(null);
      } else if (!noteDirty) {
        showNoteEditor(current);
      } else if (Number(current.version || 1) !== activeNoteVersion) {
        $('#noteMeta').textContent = 'Есть более новая версия от ' + (current.updated_by || 'другого сотрудника') + '. Ваши несохранённые изменения пока сохранены в редакторе.';
        $('#noteReloadLatest').hidden = false;
      }
    }).catch(function () { toast('Не удалось загрузить заметки', true); });
  }
  function openNote(id) {
    if (noteDirty && !confirm('В заметке есть несохранённые изменения. Открыть другую запись без сохранения?')) return;
    var n = NOTES.find(function (x) { return Number(x.id) === Number(id); });
    if (n) showNoteEditor(n);
  }
  $('#notesList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-note-open]');
    if (b) openNote(b.dataset.noteOpen);
  });
  $('#noteNew').addEventListener('click', function () {
    if (noteDirty && !confirm('В заметке есть несохранённые изменения. Создать новую без сохранения текущей?')) return;
    api('/api/notes', { method: 'POST', body: { title: 'Новая заметка', body: '' } }).then(function (d) {
      if (!d.ok) return toast(d.error || 'Не удалось создать заметку', true);
      NOTES.unshift(d.note);
      showNoteEditor(d.note);
      toast('Заметка создана');
    });
  });
  $('#noteTitle').addEventListener('input', function () {
    noteDirty = true;
    $('#noteMeta').textContent = 'Есть несохранённые изменения';
    $('#noteReloadLatest').hidden = true;
  });
  $('#noteBody').addEventListener('input', function () {
    noteDirty = true;
    $('#noteMeta').textContent = 'Есть несохранённые изменения';
    $('#noteReloadLatest').hidden = true;
  });
  $('#noteSave').addEventListener('click', function () {
    if (!activeNoteId) return;
    var title = $('#noteTitle').value.trim();
    if (!title) return toast('Укажите заголовок заметки', true);
    var body = $('#noteBody').value;
    if (body.length > 20000) return toast('Текст заметки слишком длинный', true);
    api('/api/notes', { method: 'PUT', body: {
      id: activeNoteId, version: activeNoteVersion, title: title, body: body
    }}).then(function (d) {
      if (!d.ok) {
        if (d.status === 409 && d.note) {
          var i = NOTES.findIndex(function (n) { return Number(n.id) === Number(d.note.id); });
          if (i >= 0) NOTES[i] = d.note; else NOTES.unshift(d.note);
          renderNotesList();
          $('#noteMeta').textContent = 'Конфликт изменений: запись уже обновил ' + (d.note.updated_by || 'другой сотрудник') + '. Скопируйте свой текст или загрузите свежую версию.';
          $('#noteReloadLatest').hidden = false;
          return toast('Другой сотрудник уже изменил эту заметку. Ваша версия не перезаписана.', true);
        }
        return toast(d.error || 'Не удалось сохранить заметку', true);
      }
      var i = NOTES.findIndex(function (n) { return Number(n.id) === Number(d.note.id); });
      if (i >= 0) NOTES[i] = d.note; else NOTES.unshift(d.note);
      showNoteEditor(d.note);
      toast('Заметка сохранена для всей команды');
    });
  });
  $('#noteReloadLatest').addEventListener('click', function () {
    var n = NOTES.find(function (x) { return Number(x.id) === Number(activeNoteId); });
    if (n) showNoteEditor(n);
  });
  $('#noteDelete').addEventListener('click', function () {
    if (!activeNoteId || !confirm('Удалить заметку «' + $('#noteTitle').value + '»?')) return;
    api('/api/notes?id=' + encodeURIComponent(activeNoteId) + '&version=' + encodeURIComponent(activeNoteVersion), { method: 'DELETE' }).then(function (d) {
      if (!d.ok) {
        if (d.status === 409 && d.note) {
          var latestIndex = NOTES.findIndex(function (n) { return Number(n.id) === Number(d.note.id); });
          if (latestIndex >= 0) NOTES[latestIndex] = d.note; else NOTES.unshift(d.note);
          renderNotesList();
          $('#noteMeta').textContent = 'Заметку уже обновил ' + (d.note.updated_by || 'другой сотрудник') + '. Обновите версию перед удалением.';
          $('#noteReloadLatest').hidden = false;
        }
        return toast(d.error || 'Не удалось удалить заметку', true);
      }
      NOTES = NOTES.filter(function (n) { return Number(n.id) !== Number(activeNoteId); });
      showNoteEditor(null);
      toast('Заметка удалена');
    });
  });
  $('#notesReload').addEventListener('click', loadNotes);
  setInterval(function () {
    if (!$('#app').hidden && $('#p-notes').classList.contains('on')) loadNotes();
  }, 20000);

  window.AdminNotes = { load: loadNotes };
})();
