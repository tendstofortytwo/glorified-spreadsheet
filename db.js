
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const db = await open({
    filename: 'blockchain.db',
    driver: sqlite3.Database
});

await db.run('pragma foreign_keys = on');

await db.run(`create table if not exists accounts(
    id		integer	primary key,
    name	text	not null
)`);

await db.run(`create table if not exists transactions(
    id			integer		primary key,
    timestamp	datetime	not null,
    amount		bigint		not null,
    description	text		not null,
    account_id	integer		not null,
    notes		text,
    foreign key(account_id)	references accounts(id)
)`);

await db.run(`create table if not exists tags(
    id		integer	primary key,
    name	text	not null
)`);

await db.run(`create table if not exists transaction_tags(
    trans_id	integer not null,
    tag_id		integer not null,
    foreign key(trans_id)	references transactions(id),
    foreign key(tag_id) 	references tags(id)
)`);

export default db;
