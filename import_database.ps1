# PowerShell script to import all SQL files into MySQL
# Run this script: .\import_database.ps1

$password = Read-Host "Enter MySQL root password" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

$dbName = "trading_platform"
$sqlFilesPath = "C:\Users\1230s\Downloads\attachments"

Write-Host "Creating database $dbName..." -ForegroundColor Green
mysql -u root -p$passwordPlain -e "CREATE DATABASE IF NOT EXISTS $dbName;"

Write-Host "Importing SQL files..." -ForegroundColor Green

# Import order matters - import tables first, then data
# 1. Core tables (courses, users, channels)
# 2. Related tables (messages, user_courses, etc.)

$files = @(
    "trading_platform_courses.sql",
    "trading_platform_course.sql",
    "trading_platform_course_model.sql",
    "trading_platform_users.sql",
    "trading_platform_channel_model.sql",
    "trading_platform_channels.sql",
    "trading_platform_message_model.sql",
    "trading_platform_messages.sql",
    "trading_platform_user_courses.sql",
    "trading_platform_user_channel_access.sql",
    "trading_platform_level_model.sql",
    "trading_platform_unread_messages.sql",
    "trading_platform_conversations.sql",
    "trading_platform_conversation_participants.sql",
    "trading_platform_direct_messages.sql",
    "trading_platform_comment_model.sql",
    "trading_platform_contact_message_model.sql"
)

foreach ($file in $files) {
    $filePath = Join-Path $sqlFilesPath $file
    if (Test-Path $filePath) {
        Write-Host "Importing $file..." -ForegroundColor Yellow
        mysql -u root -p$passwordPlain $dbName < $filePath
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ $file imported successfully" -ForegroundColor Green
        } else {
            Write-Host "✗ Error importing $file" -ForegroundColor Red
        }
    } else {
        Write-Host "✗ File not found: $file" -ForegroundColor Red
    }
}

Write-Host "`nDatabase import complete!" -ForegroundColor Green
Write-Host "Database: $dbName" -ForegroundColor Cyan
Write-Host "Host: localhost" -ForegroundColor Cyan
Write-Host "User: root" -ForegroundColor Cyan
Write-Host "`nFor Vercel, you'll need to use a cloud MySQL database." -ForegroundColor Yellow
