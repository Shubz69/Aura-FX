@echo off
REM Import SQL files to FreeSQLDatabase.com

set MYSQL_HOST=sql8.freesqldatabase.com
set MYSQL_USER=sql8806090
set MYSQL_PASSWORD=DGqFQx5FTd
set MYSQL_DATABASE=sql8806090
set SQL_PATH=C:\Users\1230s\Downloads\attachments

echo ========================================
echo Importing to FreeSQLDatabase.com
echo ========================================
echo Host: %MYSQL_HOST%
echo Database: %MYSQL_DATABASE%
echo.
echo Testing connection...
mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=DISABLED -e "SELECT 1;" %MYSQL_DATABASE% 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Trying with SSL...
    mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% --ssl-mode=REQUIRED -e "SELECT 1;" %MYSQL_DATABASE% 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Could not connect to database!
        echo Please check:
        echo 1. Your internet connection
        echo 2. FreeSQLDatabase account is active
        echo 3. Database credentials are correct
        pause
        exit /b 1
    )
    set USE_SSL=--ssl-mode=REQUIRED
) else (
    set USE_SSL=--ssl-mode=DISABLED
)

echo Connection successful!
echo.
echo Importing SQL files...
echo.

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %USE_SSL% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_courses.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] courses) else (echo [FAIL] courses)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_course.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] course) else (echo [FAIL] course)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_course_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] course_model) else (echo [FAIL] course_model)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_users.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] users) else (echo [FAIL] users)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_channel_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] channel_model) else (echo [FAIL] channel_model)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_channels.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] channels) else (echo [FAIL] channels)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_message_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] message_model) else (echo [FAIL] message_model)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] messages) else (echo [FAIL] messages)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_user_courses.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] user_courses) else (echo [FAIL] user_courses)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_user_channel_access.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] user_channel_access) else (echo [FAIL] user_channel_access)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_level_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] level_model) else (echo [FAIL] level_model)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_unread_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] unread_messages) else (echo [FAIL] unread_messages)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_conversations.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] conversations) else (echo [FAIL] conversations)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_conversation_participants.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] conversation_participants) else (echo [FAIL] conversation_participants)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_direct_messages.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] direct_messages) else (echo [FAIL] direct_messages)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_comment_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] comment_model) else (echo [FAIL] comment_model)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_contact_message_model.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] contact_message_model) else (echo [FAIL] contact_message_model)

mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < "%SQL_PATH%\trading_platform_message_channels.sql"
if %ERRORLEVEL% EQU 0 (echo [OK] message_channels) else (echo [FAIL] message_channels)

echo.
echo ========================================
echo Import Complete!
echo ========================================
echo.
echo Add these to Vercel Environment Variables:
echo.
echo MYSQL_HOST=sql8.freesqldatabase.com
echo MYSQL_USER=sql8806090
echo MYSQL_PASSWORD=DGqFQx5FTd
echo MYSQL_DATABASE=sql8806090
echo MYSQL_SSL=false (or true if SSL is required)
echo.
echo NOTE: Check the import output above to see if SSL was used
echo If connection used SSL, set MYSQL_SSL=true in Vercel
echo Otherwise, set MYSQL_SSL=false
echo.
pause

