# Phase 01 — Desktop Layer Proof of Concept

**Trạng thái:** source/CI triển khai qua PR #2 và #3; code đã được đưa vào `dev`. **Chưa nghiệm thu thực tế Fedora GNOME Classic 50.5 Wayland.**

## Đã làm

- GNOME Shell Extension lifecycle, background actor charcoal `#111111`.
- Camera world/screen transforms thuần JS, zoom `Ctrl + Wheel` 25–300%, pan chuột giữa.
- Guards cho `_backgroundGroup` không tồn tại; cleanup signal/pointer grab.
- Test coordinate math, static metadata / ZIP, tài liệu và GitHub Actions.

## Chưa đạt/chưa xác minh

- GNOME Classic compositor thật: input capture, không che panel/window, Overview, multi-monitor, lock, xung đột extensions.
- API `Main.layoutManager._backgroundGroup` private nên có rủi ro update GNOME.
- Bản PoC đầu có demo cards, Phase 2 thay chúng bằng text notes từ backend thực.

## Evidence & Git

- PR #2: https://github.com/mujin0422/evidence-note-board/pull/2
- PR #3: https://github.com/mujin0422/evidence-note-board/pull/3
- Test checklist: [PHASE1_TEST_PLAN](../PHASE1_TEST_PLAN.md)

**Acceptance:** phải có ảnh/video và biên bản test trên GNOME Classic 50.5 thật trước khi đóng Phase 1.
