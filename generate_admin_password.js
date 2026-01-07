// Generate Admin Password Hash
// Run this with: node generate_admin_password.js
// Then use the generated hash in create_admin_user.sql

const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('========================================');
console.log('AURA FX - Admin User Password Generator');
console.log('========================================\n');

rl.question('Enter password for shubzfx@gmail.com: ', async (password) => {
  if (!password || password.length < 6) {
    console.error('\n❌ Password must be at least 6 characters long!');
    rl.close();
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    
    console.log('\n✅ Password hash generated successfully!\n');
    console.log('========================================');
    console.log('Copy this SQL statement:');
    console.log('========================================\n');
    
    console.log(`INSERT INTO users (username, email, password, name, avatar, role, muted, mfa_verified, dtype, subscription_status, created_at)
VALUES (
    'shubzfx',
    'shubzfx@gmail.com',
    '${hash}',
    'Head Admin',
    '/avatars/avatar_ai.png',
    'ADMIN',
    FALSE,
    FALSE,
    'UserModel',
    'active',
    NOW()
)
ON DUPLICATE KEY UPDATE 
    role = 'ADMIN',
    subscription_status = 'active',
    password = '${hash}',
    name = 'Head Admin';\n`);
    
    console.log('========================================');
    console.log('Login Credentials:');
    console.log('========================================');
    console.log('Email: shubzfx@gmail.com');
    console.log(`Password: ${password}`);
    console.log('\n⚠️  IMPORTANT: Save these credentials securely!');
    console.log('⚠️  Run this SQL in MySQL Workbench after importing database_schema.sql\n');
    
    rl.close();
  } catch (error) {
    console.error('\n❌ Error generating hash:', error.message);
    rl.close();
    process.exit(1);
  }
});




