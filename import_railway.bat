@echo off
REM Import SQL files to Railway MySQL database
REM Run this after you get your Railway connection details

echo ========================================
echo Import to Railway MySQL Database
echo ========================================
echo.
echo Get your connection details from Railway Dashboard:
echo - Go to your MySQL service
echo - Click "Connect" or "Variables" tab
echo - Copy MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
echo.
pause

set /p MYSQL_HOST="Enter Railway Host (MYSQLHOST): "
set /p MYSQL_USER="Enter Railway User (MYSQLUSER, usually 'root'): "
set /p MYSQL_PASSWORD="Enter Railway Password (MYSQLPASSWORD): "
set /p MYSQL_DATABASE="Enter Railway Database (MYSQLDATABASE, usually 'railway'): "
set /p MYSQL_PORT="Enter Railway Port (MYSQLPORT, usually 3306): "

if "%MYSQL_PORT%"=="" set MYSQL_PORT=3306
if "%MYSQL_DATABASE%"=="" set MYSQL_DATABASE=railway

set SQL_PATH=C:\Users\1230s\Downloads\attachments

echo.
echo Testing connection...
mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED -e "SELECT 1;" %MYSQL_DATABASE% 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Could not connect to Railway database!
    echo Check your connection details and try again.
    pause
    exit /b 1
)

echo Connection successful!
echo.
echo Importing SQL files...
echo.

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_courses.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] courses) else (echo [FAIL] courses)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_course.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] course) else (echo [FAIL] course)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_course_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] course_model) else (echo [FAIL] course_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_users.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] users) else (echo [FAIL] users)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_channel_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] channel_model) else (echo [FAIL] channel_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_channels.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] channels) else (echo [FAIL] channels)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_message_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] message_model) else (echo [FAIL] message_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] messages) else (echo [FAIL] messages)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_user_courses.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] user_courses) else (echo [FAIL] user_courses)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_user_channel_access.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] user_channel_access) else (echo [FAIL] user_channel_access)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_level_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] level_model) else (echo [FAIL] level_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_unread_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] unread_messages) else (echo [FAIL] unread_messages)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_conversations.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] conversations) else (echo [FAIL] conversations)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_conversation_participants.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] conversation_participants) else (echo [FAIL] conversation_participants)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_direct_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] direct_messages) else (echo [FAIL] direct_messages)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_comment_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] comment_model) else (echo [FAIL] comment_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_contact_message_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] contact_message_model) else (echo [FAIL] contact_message_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_message_channels.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] message_channels) else (echo [FAIL] message_channels)

echo.
echo ========================================
echo Import Complete!
echo ========================================
echo.
echo Add these to Vercel Environment Variables:
echo.
echo MYSQL_HOST=%MYSQL_HOST%
echo MYSQL_USER=%MYSQL_USER%
echo MYSQL_PASSWORD=%MYSQL_PASSWORD%
echo MYSQL_DATABASE=%MYSQL_DATABASE%
echo MYSQL_PORT=%MYSQL_PORT%
echo MYSQL_SSL=false
echo.
pause

REM Import SQL files to Railway MySQL database
REM Run this after you get your Railway connection details

echo ========================================
echo Import to Railway MySQL Database
echo ========================================
echo.
echo Get your connection details from Railway Dashboard:
echo - Go to your MySQL service
echo - Click "Connect" or "Variables" tab
echo - Copy MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
echo.
pause

set /p MYSQL_HOST="Enter Railway Host (MYSQLHOST): "
set /p MYSQL_USER="Enter Railway User (MYSQLUSER, usually 'root'): "
set /p MYSQL_PASSWORD="Enter Railway Password (MYSQLPASSWORD): "
set /p MYSQL_DATABASE="Enter Railway Database (MYSQLDATABASE, usually 'railway'): "
set /p MYSQL_PORT="Enter Railway Port (MYSQLPORT, usually 3306): "

if "%MYSQL_PORT%"=="" set MYSQL_PORT=3306
if "%MYSQL_DATABASE%"=="" set MYSQL_DATABASE=railway

set SQL_PATH=C:\Users\1230s\Downloads\attachments

echo.
echo Testing connection...
mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED -e "SELECT 1;" %MYSQL_DATABASE% 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Could not connect to Railway database!
    echo Check your connection details and try again.
    pause
    exit /b 1
)

echo Connection successful!
echo.
echo Importing SQL files...
echo.

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_courses.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] courses) else (echo [FAIL] courses)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_course.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] course) else (echo [FAIL] course)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_course_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] course_model) else (echo [FAIL] course_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_users.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] users) else (echo [FAIL] users)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_channel_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] channel_model) else (echo [FAIL] channel_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_channels.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] channels) else (echo [FAIL] channels)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_message_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] message_model) else (echo [FAIL] message_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] messages) else (echo [FAIL] messages)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_user_courses.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] user_courses) else (echo [FAIL] user_courses)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_user_channel_access.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] user_channel_access) else (echo [FAIL] user_channel_access)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_level_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] level_model) else (echo [FAIL] level_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_unread_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] unread_messages) else (echo [FAIL] unread_messages)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_conversations.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] conversations) else (echo [FAIL] conversations)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_conversation_participants.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] conversation_participants) else (echo [FAIL] conversation_participants)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_direct_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] direct_messages) else (echo [FAIL] direct_messages)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_comment_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] comment_model) else (echo [FAIL] comment_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_contact_message_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] contact_message_model) else (echo [FAIL] contact_message_model)

mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_message_channels.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] message_channels) else (echo [FAIL] message_channels)

echo.
echo ========================================
echo Import Complete!
echo ========================================
echo.
echo Add these to Vercel Environment Variables:
echo.
echo MYSQL_HOST=%MYSQL_HOST%
echo MYSQL_USER=%MYSQL_USER%
echo MYSQL_PASSWORD=%MYSQL_PASSWORD%
echo MYSQL_DATABASE=%MYSQL_DATABASE%
echo MYSQL_PORT=%MYSQL_PORT%
echo MYSQL_SSL=false
echo.
pause

