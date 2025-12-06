@echo off
REM Batch script to import all SQL files into MySQL
REM Run this script: import_database.bat

set DB_NAME=trading_platform
set SQL_PATH=C:\Users\1230s\Downloads\attachments

echo Creating database %DB_NAME%...
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS %DB_NAME%;"

echo.
echo Importing SQL files...
echo.

REM Import files in order
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_courses.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_course.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_course_model.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_users.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_channel_model.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_channels.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_message_model.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_messages.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_user_courses.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_user_channel_access.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_level_model.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_unread_messages.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_conversations.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_conversation_participants.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_direct_messages.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_comment_model.sql"
mysql -u root -p %DB_NAME% < "%SQL_PATH%\trading_platform_contact_message_model.sql"

echo.
echo Database import complete!
echo.
echo Database: %DB_NAME%
echo Host: localhost
echo User: root
echo.
echo NOTE: For Vercel deployment, you'll need a cloud MySQL database.
echo Vercel cannot connect to localhost databases.

pause

