@echo off
REM Chay MOT LAN moi kiem thu + danh gia AI. Ket qua: test_ai_ket_qua.txt (cung thu muc nay).
REM   test_ai.bat            tat ca (can mang cong ty cho phan V-LLM)
REM   test_ai.bat --ai-only  chi phan V-LLM
REM   test_ai.bat --no-ai    chi pytest + test giao dien
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
cd /d "%~dp0"
if exist "server\venv\Scripts\activate.bat" (
  call "server\venv\Scripts\activate.bat"
) else if exist "venv\Scripts\activate.bat" (
  call "venv\Scripts\activate.bat"
)
cd server
python -m evals.run_all %*
cd ..
echo.
echo Xong. Gui file test_ai_ket_qua.txt cho Claude.
pause
