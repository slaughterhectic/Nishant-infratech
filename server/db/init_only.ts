import { initializeDatabase } from './database';

initializeDatabase()
  .then(() => {
    console.log('Init complete');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Init failed:', e);
    process.exit(1);
  });
