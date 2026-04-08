import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import typescriptParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  // 1. IGNORES GLOBALES
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.astro/**',
      '*.log',
      'src/**/*.astro', // Astro files handled by Astro build
    ],
  },

  // Special config for config files that use process.env
  {
    files: ['astro.config.mjs', 'tailwind.config.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },

  // Astro files - use simple JS parser without project
  {
    files: ['src/**/*.astro'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
        URLSearchParams: 'readonly',
        import: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  // 2. REGLAS PARA TODO EL PROYECTO
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
        URLSearchParams: 'readonly',
        import: 'readonly',
      },
    },
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Imports
      'import/extensions': ['off'],
      'import/no-unresolved': 'off', // Astro handles this differently
      'import/order': ['warn', { 'newlines-between': 'always' }],
      
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      
      // React
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      
      // General
      'no-console': ['off'], // Allow console in frontend for debugging
      'eqeqeq': ['error', 'always'],
    },
  },

  // Override: Ignore exhaustive-deps warning for Dashboard useEffect pattern
  {
    files: ['src/components/Dashboard.tsx'],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
);