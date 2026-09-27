@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo صفحة المراجعة تفتح بعد ثوان... لا تغلق هذه النافذة أثناء المراجعة.
start "" /b cmd /c "timeout /t 8 >nul && start http://localhost:8010"
python tools\review_server.py
