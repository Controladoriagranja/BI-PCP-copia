@echo off
setlocal
cd /d "%~dp0.."
if defined PCP_PYTHON (
  "%PCP_PYTHON%" "%~dp0robo_metas_produtividade.py" --env "%~dp0..\.env" %*
) else if exist "%~dp0..\.venv\Scripts\python.exe" (
  "%~dp0..\.venv\Scripts\python.exe" "%~dp0robo_metas_produtividade.py" --env "%~dp0..\.env" %*
) else (
  py -3 "%~dp0robo_metas_produtividade.py" --env "%~dp0..\.env" %*
)
exit /b %errorlevel%
