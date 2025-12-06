# Admin Capabilities Reference

## Role System Overview

### Roles
1. **Free User** - Basic access
2. **Premium User** - Full course access
3. **Admin** - Limited admin access (capabilities assigned by Super Admin)
4. **Super Admin** - Full system access (shubzfx@gmail.com only)

---

## Admin Capabilities List

### 📨 Message Management
- **DELETE_MESSAGES** - Delete any message in any channel
- **EDIT_MESSAGES** - Edit any message in any channel
- **VIEW_ALL_MESSAGES** - View all messages across all channels

### 📢 Channel Management
- **CREATE_CHANNELS** - Create new community channels
- **DELETE_CHANNELS** - Delete existing channels
- **EDIT_CHANNELS** - Modify channel settings (name, description, access level)
- **MANAGE_CHANNEL_ACCESS** - Control who can access which channels

### 👥 User Management
- **VIEW_USERS** - View list of all users
- **EDIT_USERS** - Edit user information
- **BAN_USERS** - Ban users from the platform
- **UNBAN_USERS** - Unban previously banned users
- **ASSIGN_ROLES** - Assign roles to users (free, premium, admin)
- **VIEW_USER_DETAILS** - View detailed user information

### 📚 Content Management
- **MANAGE_COURSES** - Create, edit, and delete courses
- **MANAGE_ANNOUNCEMENTS** - Create and manage announcements
- **MODERATE_CONTENT** - Moderate user-generated content

### 📊 System Management
- **VIEW_ANALYTICS** - View platform analytics and statistics
- **MANAGE_SETTINGS** - Manage platform settings
- **VIEW_LOGS** - View system logs
- **MANAGE_SUBSCRIPTIONS** - Manage user subscriptions

### 🎫 Support Management
- **VIEW_SUPPORT_TICKETS** - View all support tickets
- **RESPOND_TO_TICKETS** - Respond to support tickets
- **CLOSE_TICKETS** - Close support tickets

---

## Super Admin Only Capabilities

### 👑 Admin Management
- **CREATE_ADMINS** - Create new admin accounts
- **DELETE_ADMINS** - Remove admin privileges from users
- **EDIT_ADMIN_PERMISSIONS** - Edit which capabilities admins have
- **VIEW_ADMIN_ACTIVITY** - View activity logs of all admins

### ⚙️ System Configuration
- **MANAGE_SYSTEM_SETTINGS** - Configure system-wide settings
- **MANAGE_DATABASE** - Direct database access and management
- **MANAGE_INTEGRATIONS** - Manage third-party integrations
- **VIEW_SYSTEM_LOGS** - View detailed system logs
- **MANAGE_BACKUPS** - Create and manage system backups

---

## Default Admin Capabilities

When you assign the "Admin" role to a user, they automatically get these capabilities:

1. DELETE_MESSAGES
2. EDIT_MESSAGES
3. VIEW_ALL_MESSAGES
4. CREATE_CHANNELS
5. DELETE_CHANNELS
6. EDIT_CHANNELS
7. VIEW_USERS
8. VIEW_USER_DETAILS
9. MODERATE_CONTENT
10. VIEW_SUPPORT_TICKETS
11. RESPOND_TO_TICKETS
12. CLOSE_TICKETS

**Note:** You can customize which capabilities each admin has in the Settings page.

---

## Super Admin Account

**Email:** shubzfx@gmail.com

**Security:**
- Cannot be deleted
- Cannot have role changed
- Has ALL capabilities automatically
- Most powerful and secure account

---

## How to Use

1. **Access Settings:** Click your profile icon → Settings (top right dropdown)
2. **Manage Users:** Go to "User Management" tab
3. **Assign Roles:** Select a user → Choose role → Select capabilities → Save
4. **Manage Admins:** Go to "Admin Management" tab to see all admins
5. **View Capabilities:** Go to "Capabilities" tab to see full reference

---

## Security Notes

- Only Super Admin (shubzfx@gmail.com) can assign roles
- Super Admin account is protected and cannot be modified
- Admin capabilities are stored in database and can be customized per admin
- All admin actions should be logged for security auditing

