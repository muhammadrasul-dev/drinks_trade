// Shared PostCSS config: apps re-export it so Tailwind runs the same way everywhere.
const config = {
  plugins: { '@tailwindcss/postcss': {} },
};

export default config;
