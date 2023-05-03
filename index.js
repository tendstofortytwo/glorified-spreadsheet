import fastify from 'fastify';
import fastifyView from '@fastify/view';
import fastifyFormbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import pug from 'pug';
import db from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.pii.js';

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function displayDatetime(datetime) {
	const dt = new Date(datetime);
	const date = dt.getDate().toString().padStart(2, '0');
	const month = months[dt.getMonth()];
	const year = dt.getFullYear().toString();
	const hour = dt.getHours().toString().padStart(2, '0');
	const min = dt.getMinutes().toString().padStart(2, '0');
	return `${date} ${month} ${year}, ${hour}:${min}`;
}

function displayCurrency(amt) {
	return (Number(amt) / 100).toFixed(2);
}

async function main() {
	const app = fastify({
		logger: true,
		https: config.https
	});

	app.register(fastifyView, {
		engine: {pug},
		defaultContext: {
			datetime: displayDatetime,
			currency: displayCurrency
		}
	});

	app.register(fastifyFormbody);

	app.register(fastifyStatic, {
		root: path.join(__dirname, 'static/'),
		prefix: '/static/'
	});

	app.get('/', async (_req, res) => {
		const accounts = await db.all('select * from accounts');
		const transactions = await db.all(
			`select
				transactions.*, accounts.name as account_name, group_concat(tags.name, ', ') as tags
			 from 
			 	(transactions join accounts on accounts.id = transactions.account_id)
				left join (transaction_tags join tags on transaction_tags.tag_id = tags.id)
				on transactions.id = transaction_tags.trans_id
			 group by transactions.id
			 order by transactions.timestamp desc`
		);
		const total = (await db.get(
			`select sum(amount) as total from transactions`
		)).total;
		res.view('views/index.pug', {accounts, transactions, total});
		return res;
	});

	app.get('/accounts/new', (_req, res) => {
		res.view('views/account-new.pug');
		return res;
	});

	app.post('/accounts/new', async (req, res) => {
		await db.run('insert into accounts(name) values(?)', req.body.name);
		res.redirect('/');
		return res;
	});

	app.get('/tags/new', (_req, res) => {
		res.view('views/tag-new.pug');
		return res;
	});

	app.post('/tags/new', async (req, res) => {
		await db.run('insert into tags(name) values(?)', req.body.name);
		res.redirect('/');
		return res;
	});

	app.get('/accounts/:id', async (req, res) => {
		const transactions = await db.all(
			`select
				transactions.*, accounts.name as account_name, group_concat(tags.name, ', ') as tags
			 from 
			 	(transactions join accounts on accounts.id = transactions.account_id)
				left join (transaction_tags join tags on transaction_tags.tag_id = tags.id)
				on transactions.id = transaction_tags.trans_id
			 where account_id = ?
			 group by transactions.id
			 order by transactions.timestamp desc`,
			[req.params.id]
		);
		const total = (await db.get(
			`select sum(amount) as total from transactions
			 where account_id = ?`,
			[req.params.id]
		)).total;
		const account = await db.get('select * from accounts where id = ?', req.params.id);
		res.view('views/account.pug', {transactions, account, total});
		return res;
	});

	app.get('/transactions/new', async (req, res) => {
		const accounts = (await db.all('select * from accounts'))
			.map(a => ({...a, selected: req.query.account_id === a.id.toString()}));
		const tags = await db.all('select * from tags');
		res.view('views/transaction-new.pug', {accounts, tags});
		return res;
	});

	const multipliers = {
		income: 1,
		expense: -1
	};

	app.post('/transactions/new', async (req, res) => {
		const transactionID = (await db.run(
			'insert into transactions(timestamp, amount, description, account_id, notes) values(?, ?, ?, ?, ?)',
			[
				(new Date()).toISOString(),
				multipliers[req.body.type] * req.body.amount * 100,
				req.body.description,
				req.body.account_id,
				req.body.notes
			]
		)).lastID;

		if(req.body.tags) {
			for(const tagID of req.body.tags) {
				await db.get('insert into transaction_tags(trans_id, tag_id) values(?, ?)', [transactionID, tagID]);
			}
		}

		res.redirect(`/accounts/${req.body.account_id}`);
		return res;
	});

	app.get('/transactions/:id', async (req, res) => {
		const transaction = await db.get(
			`select *
			 from transactions
			 where transactions.id = ?`,
		req.params.id);
		const accounts = (await db.all('select * from accounts'))
			.map(a => ({...a, selected: transaction.account_id.toString() === a.id.toString()}));
		const transactionTags = (await db.all(
			`select tag_id
			 from transaction_tags
			 where trans_id = ?`,
			transaction.id)
		).map(t => t.tag_id);
		const tags = (await db.all(`select * from tags`))
			.map(t => ({...t, selected: transactionTags.indexOf(t.id) >= 0}));
		res.view('views/transaction.pug', {accounts, transaction, tags});
		return res;
	});

	app.post('/transactions/:id', async (req, res) => {
		await db.run(
			'update transactions set amount = ?, description = ?, account_id = ?, notes = ? where id = ?',
			[
				multipliers[req.body.type] * req.body.amount * 100,
				req.body.description,
				req.body.account_id,
				req.body.notes,
				req.params.id
			]
		);

		if(req.body.tags) {
			await db.run('delete from transaction_tags where trans_id = ?', req.params.id);
			for(const tagID of req.body.tags) {
				await db.get('insert into transaction_tags(trans_id, tag_id) values(?, ?)', [req.params.id, tagID]);
			}
		}

		res.redirect('/transactions/' + req.params.id);
		return res;
	});

	await app.listen({ port: config.port || 3000, host: '::' });
}

await main();

