@echo off
REM Inicia o servidor local (charset UTF-8 + multi-thread) e abre o site offline no navegador.
cd /d "%~dp0"
start "" http://127.0.0.1:5601/
python serve_utf8.py 5601
