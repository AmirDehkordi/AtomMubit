import 'reflect-metadata';
import { DbService } from './db/db.service';
async function main() { const database = new DbService(); try {await database.onModuleInit();} finally {await database.onModuleDestroy();} }
void main().catch(error=>{console.error(error);process.exitCode=1;});
