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

// will be used as the default value for "start date range" when filtering by date
const beginningOfTime = '2023-01-01';

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

	app.get('/', async (req, res) => {
		const dateRange = {
			start: req.query.startDate ?? beginningOfTime,
			end: req.query.endDate ?? (new Date()).toISOString().split('T')[0]
		};
		const accounts = await db.all('select * from accounts');
		const tags = await db.all('select * from tags');
		const transactions = await db.all(
			`select
				transactions.*, accounts.name as account_name, group_concat(tags.name, ', ') as tags
			 from 
			 	(transactions join accounts on accounts.id = transactions.account_id)
				left join (transaction_tags join tags on transaction_tags.tag_id = tags.id)
				on transactions.id = transaction_tags.trans_id
			 where
			 	timestamp between ? and ?
			 group by transactions.id
			 order by transactions.timestamp desc`,
			 [ dateRange.start, dateRange.end ]
		);
		const { total } = await db.get(`select sum(amount) as total from transactions`);
		// if either range marker was provided, compute the total in range as well
		let rangeTotal = null;
		if(req.query.startDate || req.query.endDate) {
			rangeTotal = (await db.get(
				`select sum(amount) as total from transactions
				 where timestamp between ? and ?`,
				[ dateRange.start, dateRange.end ]
			)).total || 0;
		}
		res.view('views/index.pug', {accounts, tags, transactions, total, dateRange, rangeTotal});
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

	app.get('/tags/:id', async (req, res) => {
		const dateRange = {
			start: req.query.startDate ?? beginningOfTime,
			end: req.query.endDate ?? (new Date()).toISOString().split('T')[0]
		};
		const transactions = await db.all(
			`select
				transactions.*, accounts.name as account_name, group_concat(tags.name, ', ') as tags
			 from 
			 	(transactions join accounts on accounts.id = transactions.account_id)
				left join (transaction_tags join tags on transaction_tags.tag_id = tags.id)
				on transactions.id = transaction_tags.trans_id
			 where
			 	transaction_tags.tag_id = ?
				and timestamp between ? and ?
			 group by transactions.id
			 order by transactions.timestamp desc`,
			[req.params.id, dateRange.start, dateRange.end]
		);
		const { total } = await db.get(
			`select sum(amount) as total 
			from (transactions join transaction_tags on transaction_tags.trans_id = transactions.id)
			where tag_id = ?`,
			[req.params.id]);
		// if either range marker was provided, compute the total in range as well
		let rangeTotal = null;
		if(req.query.startDate || req.query.endDate) {
			rangeTotal = (await db.get(
				`select sum(amount) as total 
				 from (transactions join transaction_tags on transaction_tags.trans_id = transactions.id)
				 where tag_id = ? and timestamp between ? and ?`,
				[ req.params.id, dateRange.start, dateRange.end ]
			)).total || 0;
		}
		const tag = await db.get('select * from tags where id = ?', req.params.id);
		res.view('views/tag.pug', {transactions, tag, total, dateRange, rangeTotal});
		return res;
	});

	app.get('/accounts/:id', async (req, res) => {
		const dateRange = {
			start: req.query.startDate ?? beginningOfTime,
			end: req.query.endDate ?? (new Date()).toISOString().split('T')[0]
		};
		const transactions = await db.all(
			`select
				transactions.*, accounts.name as account_name, group_concat(tags.name, ', ') as tags
			 from 
			 	(transactions join accounts on accounts.id = transactions.account_id)
				left join (transaction_tags join tags on transaction_tags.tag_id = tags.id)
				on transactions.id = transaction_tags.trans_id
			 where
			 	account_id = ? and
				timestamp between ? and ?
			 group by transactions.id
			 order by transactions.timestamp desc`,
			[req.params.id, dateRange.start, dateRange.end]
		);
		const { total } = await db.get(`select sum(amount) as total from transactions where account_id = ?`,
			[req.params.id]);
		// if either range marker was provided, compute the total in range as well
		let rangeTotal = null;
		if(req.query.startDate || req.query.endDate) {
			rangeTotal = (await db.get(
				`select sum(amount) as total 
				 from transactions
				 where account_id = ? and timestamp between ? and ?`,
				[ req.params.id, dateRange.start, dateRange.end ]
			)).total || 0;
		}
		const account = await db.get('select * from accounts where id = ?', req.params.id);
		res.view('views/account.pug', {transactions, account, total, dateRange, rangeTotal});
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
			// req.body.tags is a <select> multiselect. turns out if you select only one option, it'll show up as a
			// string, but if you select multiple options, it'll show up as an array. and javascript just lets you
			// index into strings like arrays :D
			const tags = (typeof req.body.tags === 'string') ? [ req.body.tags ] : req.body.tags;
			console.log(tags);
			for(const tagID of tags) {
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

		await db.run('delete from transaction_tags where trans_id = ?', req.params.id);
		if(req.body.tags) {
			// req.body.tags is a <select> multiselect. turns out if you select only one option, it'll show up as a
			// string, but if you select multiple options, it'll show up as an array. and javascript just lets you
			// index into strings like arrays :D
			const tags = (typeof req.body.tags === 'string') ? [ req.body.tags ] : req.body.tags;
			for(const tagID of tags) {
				await db.get('insert into transaction_tags(trans_id, tag_id) values(?, ?)', [req.params.id, tagID]);
			}
		}

		res.redirect('/transactions/' + req.params.id);
		return res;
	});

	await app.listen({ port: config.port || 3000, host: '::' });
}

await main();

