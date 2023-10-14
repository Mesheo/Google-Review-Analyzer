require('dotenv').config();
const URL = "https://www.google.com.br/maps/place/Nema+Padaria+-+Niter%C3%B3i/@-22.9039012,-43.113625,17z/data=!3m1!4b1!4m6!3m5!1s0x998373996a193f:0xb7ce627a8de35c77!8m2!3d-22.9039012!4d-43.113625!16s%2Fg%2F11k3fns4xy?entry=ttu";
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const crypto = require('crypto');
const dbClient = require('./database/db');
const Sequelize = require('sequelize')
const reviewsCreationFunction = require('./models/reviews');

dbClient.connect();
const Reviews = reviewsCreationFunction(dbClient.sequelize, Sequelize);

function createReviewHash(reviewInfo) {
	const reviewData = `${reviewInfo.author}${reviewInfo.stars}${reviewInfo.publishedAt}${reviewInfo.reviewText}${reviewInfo.hasPhoto}`;

	const hash = crypto.createHash('sha256');
	hash.update(reviewData);
	const reviewHash = hash.digest('hex');

	return reviewHash;
}

async function extractReviewInfo(page) {
	const reviewSelector = '.jftiEf.fontBodyMedium';
	await page.waitForSelector(reviewSelector);

	const pageContent = await page.content();
	const $ = cheerio.load(pageContent);

	$(reviewSelector).each(async (index, element) => {
		const reviewcAard= $(element);
		const author = reviewcAard.find('div.d4r55').text();
		const stars = reviewcAard.find('span.kvMYJc img').length;
		const reviewDate = reviewcAard.find('span.rsqaWe').text();
		const reviewText = reviewcAard.find('span.wiI7pd').text();
		const hasPhoto = reviewcAard.find('button.WEBjve img').length > 0;

		const reviewInfo = {
			author,
			stars,
			reviewDate,
			reviewText,
			hasPhoto,
			
		}

		const reviewHash = createReviewHash(reviewInfo)

		const review = await Reviews.create({...reviewInfo, reviewHash});
		console.log("[WEBSCRAPER - ExtractReviewInfo] New Review added on database: ", review.dataValues)
	});
}

async function extractBusinessInfo(page) {
	const topInfoDiv = await page.$eval('.TIHn2', (element) => element.innerHTML);
	const $ = cheerio.load(topInfoDiv);

	const name = $('h1.DUwDvf').text();
	const ratingsAverage = parseFloat($('div.F7nice span[aria-hidden="true"]').text().replace(',', '.'));
	const numberOfReviews = parseInt($("div.F7nice span[aria-label]").text().replace(/[()]/g, ''), 10);
	const category = $('div.fontBodyMedium button.DkEaL').text();

	const botInfoDiv = await page.$eval(`div[aria-label="Informações de ${name}"]`, (element) => element.innerHTML);
	const $$ = cheerio.load(botInfoDiv);
	const cardsbotInfoDiv = $$('button[aria-label*="Endereço:"], button[aria-label*="Telefone:"], a[aria-label*="Website:"]');

	let address = "";
	let telephone = "";
	let website = "";
	cardsbotInfoDiv.each(function () {
		const label = $(this).attr('aria-label');
		if (label.includes('Endereço:')) {
			address = label.replace('Endereço: ', '');
		} else if (label.includes('Telefone:')) {
			telephone = label.replace('Telefone: ', '');
		} else if (label.includes('Website:')) {
			const href = $(this).attr('href');
			website = href;
		}
	});

	return {
		name,
		ratingsAverage,
		numberOfReviews,
		category,
		address,
		telephone,
		website,
	};
}

async function scraper(url) {
	try {
		const browser = await puppeteer.launch({ headless: false });
		const page = await browser.newPage();
		const avaliacoesSelector = '.RWPxGd button:nth-child(2)';

		await page.goto(url);
		await page.waitForSelector(avaliacoesSelector, { visible: true });
		// const businessInfo = await extractBusinessInfo(page);
		// console.log("[WEBSCRAPER] - BusinessInfo Data fetched:  ", businessInfo);

		const reviewsSelector = '.MyEned .wiI7pd'
		await page.click(avaliacoesSelector);
		await page.waitForSelector(reviewsSelector, { visible: true });
		await extractReviewInfo(page);
		// await browser.close();
	} catch (e) {
		console.error("Error occurred: ", e);
	}
}

module.exports.handler = async (event) => {
	

 	await scraper(URL);

	return {
		statusCode: 200,
		body: JSON.stringify(
			{
				status: 'pending',
				message: `Send to Metrics Queue, wait for notification`,
				input: event,
			},
			null,
			2
		),
	};
};
