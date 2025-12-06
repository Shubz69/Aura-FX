module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  rules: {
    'no-unused-vars': 'warn',
    'no-empty-pattern': 'warn',
    'react-hooks/exhaustive-deps': 'warn'
  },
  overrides: [
    {
      files: ['**/*.js', '**/*.jsx'],
      rules: {
        'no-unused-vars': 'warn',
        'no-empty-pattern': 'warn',
        'react-hooks/exhaustive-deps': 'warn'
      }
    }
  ]
};
