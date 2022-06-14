"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

//const { errorMonitor } = require("events");
const axios = require("axios").default;
const mSchedule = require("node-schedule");          // https://github.com/node-schedule/node-schedule
const axiosTimeout = 8000;
// const clientID = "22BD68";
// const clientSecret = "c4612114c93436901b6affb03a1e5ec8";
const clientID = "2387KZ";
const clientSecret = "bf343e0474cca869afb218975585b2e2";

const BASE_URL = "https://api.fitbit.com/1/user/";
const BASE2_URL = "https://api.fitbit.com/1.2/user/";

class FitBit extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "fitbit-fitness",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));

		this.updateInterval = null;
		this.fitbit = {};
		this.fitbit.sleepRecordsStoredate = null;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.setState("info.connection", false, true);

		this.login().
			then(() => {
				if (this.fitbit.status === 200) {

					this.setState("info.connection", true, true);
					//this.getTokenExpireDate(this.config.token);
					this.initSleepSchedule();
					this.getFitbitRecords();						// get data one time

					this.updateInterval = setInterval(() => {
						this.getFitbitRecords();
					}, this.config.refresh * 1000 * 60); 			// in seconds
				} else {
					this.setState("info.connection", false, true);
					this.log.warn(`FITBit login failed ${this.fitbit.status}`);
				}
			})
			.catch((error) => {
				this.log.error(`Adapter Connection: ${error} `);
			});

		this.subscribeStates("body.weight");				// fitbit-fitness.0.body.weight
		this.subscribeStates("body.fat");				// fitbit-fitness.0.body.weight
		//this.subscribeStates("*");				// fitbit-fitness.0.body.weight
	}

	async getFitbitRecords() {

		try {
			//this.log.debug(`Getting data for user ${this.fitbit.user.fullName}`);
			if (await this.checkToken()) {
				this.log.debug(`Tokens checked`);
			}
			if (this.config.activityrecords) {
				await this.getActivityRecords();
			}
			if (this.config.bodyrecords) {
				await this.getBodyRecords();
			}
			if (this.config.foodrecords) {
				await this.getFoodRecords();
			}
			if (this.config.sleeprecords && !this.config.sleeprecordsschedule) {
				this.getSleepRecords();
			}

		}
		catch (err) {
			this.log.info(`Data retrieval  ${err}`);
		}
	}

	async login() {

		try {
			const url = "https://api.fitbit.com/1/user/-/profile.json";

			if (this.config.owntoken && this.config.token != "") {
				this.log.debug(`Using own token: ${this.config.token}`);
			}
			const accessToken = await this.getStateAsync("tokens.access");
			const refreshToken = await this.getStateAsync("tokens.refresh");

			if (accessToken && refreshToken && accessToken.val && refreshToken.val) {
				this.fitbit.tokens = {
					access_token: accessToken.val,
					refresh_token: refreshToken.val
				};

				this.log.debug(`Getting refresh Token: ${this.fitbit.tokens.refresh_token}`);
			} else {
				throw new Error("no tokens available. Recreate token in config");
			}

			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${this.fitbit.tokens.access_token}` },
					timeout: axiosTimeout
				});

			this.fitbit.status = response.status;

			if (this.fitbit.status === 200) {
				this.setState("info.connection", true, true);
				this.setUserStates(response.data);
			}
		}
		catch (err) {
			throw new Error(err);
		}
	}

	setUserStates(data) {
		this.fitbit.user = data.user;				// Use instance object for data
		this.log.info(`User logged in ${this.fitbit.user.fullName} id:${this.fitbit.user.encodedId}`);
		this.setState("user.fullName", this.fitbit.user.fullName, true);
		this.setState("user.userid", this.fitbit.user.encodedId, true);
	}

	initSleepSchedule() {
		if (this.config.sleeprecordsschedule && this.config.sleeprecords) {
			const rndMinutes = Math.floor(Math.random() * 59);

			this.log.info(`Schedule for sleep activated`);
			this.schedule = mSchedule.scheduleJob(`${rndMinutes} 20 * * *"`, () => {
				if (this.config.sleeprecords) {
					this.getSleepRecords();
				}
			});
		}
	}

	async writeHistorytoState(id, historyInstance = "history.0", statearr) {
		// const statearr = [];
		// statearr.push({ ts: tsNow, val: 99, q: 0 });

		this.sendTo(historyInstance, "storeState", {
			id: id,
			state: statearr
		}, result => {
			console.log(`data inserted ${JSON.stringify(result)}`);
		}
		);
	}

	async getLastHistoryDate(id) {
		return new Promise((resolve, reject) => {
			const date = new Date().getTime();
			let state;

			this.sendTo("history.0", "getHistory", {
				id: id,
				options: {
					start: date - 60 * 60 * 1000,
					end: date,
					count: 1,
					aggregate: "none" // or 'none' to get raw values
				}
			}, (ret) => {

				// @ts-ignore
				if (ret && ret.error) {
					// @ts-ignore
					reject("Error:(gethistorydata) " + ret.error);
				} else {
					// @ts-ignore
					if (ret && ret.result) {
						// @ts-ignore
						state = ret.result.slice(-1)[0];
						resolve(this.getDateTime(state.ts));
					}
				}
			});
		});
	}

	async syncHeartRateTS(id, historyInstance = "history.0") {

		const historyValues = [];
		const from = await this.getLastHistoryDate(id);
		const now = this.getDateTime();

		this.log.info(`Syncing data from:${from.dateString}:${from.time} to: ${now.dateString}:${now.time}`);

		for (let i = from.date; i <= now.date; i.setDate(i.getDate() + 1)) {
			const stepDate = this.getDateTime(i);
			const timefrom = (i == from.date) ? from.timeShort : "00:00";
			const timeto = (i == now.date) ? now.timeShort : "23:59";
			this.log.info(`   ... syncing: ${stepDate.dateString} from ${timefrom} to ${timeto}`);
			const intradayHeartRates = await this.getHeartRateTimeSeries(stepDate.dateString, timefrom, timeto);
			//const dataset = intradayHeartRates["activities-heart-intraday"]["dataset"];

			intradayHeartRates.map(el => {
				//this.log.info(`Date : ${`${stepDate.dateString}T${el.time}`}`);
				historyValues.push({ ts: new Date(`${stepDate.dateString}T${el.time}`), val: el.value, q: 0 });
			});
		}
		this.writeHistorytoState(id, historyInstance, historyValues);
	}

	async setWeight(actWeight) {
		const url = `${BASE_URL}-/body/log/weight.json`;
		const token = this.fitbit.tokens.access_token;

		const datetime = this.getDateTime();
		const payload = `weight=${actWeight}&date=${datetime.dateString}&time=${datetime.time}`;
		this.log.info(`Payload: ${payload}`);

		try {
			const response = await axios({
				url: url,
				method: "post",
				headers: { "Authorization": `Bearer ${token}` },
				timeout: axiosTimeout,
				data: payload
			});

			this.log.info(`Status: ${response.status}`);

			// if (response.status === 200) {

			// }
		}
		catch (err) {
			this.log.warn(`setWeight: ${err}`);
		}
	}

	async getHeartRateTimeSeries(dateFrom, timeFrom, timeTo) {

		const url = `${BASE_URL}-/activities/heart/date/${dateFrom}/1d/1min/time/${timeFrom}/${timeTo}.json`;
		//const url1 = `https://api.fitbit.com/1/user/-/activities/heart/date/${from}/${period}/1min/time/17:00/19:00.json`;
		const token = this.fitbit.tokens.access_token;
		//this.log.debug(`token: ${token}`);

		try {
			const response = await axios({
				url: url,
				method: "get",
				headers: { "Authorization": `Bearer ${token}` },
				timeout: axiosTimeout
			});
			//this.log.info(`DATA: ${JSON.stringify(response.status)}`);
			if (response.status === 200) {
				const intradayData = response.data["activities-heart-intraday"]["dataset"];
				return (intradayData);
			}
		}
		catch (err) {
			return (`Error in Heartrate ${err}`);
		}
	}

	async getActivityRecords() {

		const url = `${BASE_URL}-/activities/date/${this.getDateTime().date}.json`;
		const token = this.fitbit.tokens.access_token;
		this.log.info(`url: ${url}`);

		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${token}` },
					timeout: axiosTimeout
				});
			this.log.info(`getActivityRecords Status: ${response.status}`);

			if (response.status === 200) {
				if (!this.setActivityStates(response.data)) {
					this.log.debug(`Activity Records: No activity records avaliable`);
				}
			}
		}
		catch (err) {
			this.log.warn(`getActivityRecords: ${err}`);
		}
	}

	setActivityStates(data) {
		if (data.summary) {
			this.fitbit.activities = data;				// First record in the array
			this.log.info(`Activity Records: Steps:${this.fitbit.activities.summary.steps} Floors:${this.fitbit.activities.summary.floors} Calories:${this.fitbit.activities.summary.caloriesOut} ${(this.fitbit.activities.summary.restingHeartRate) ? "BMP:" + this.fitbit.activities.summary.restingHeartRate : ""}`);

			this.setState("activity.Steps", this.fitbit.activities.summary.steps, true);
			this.setState("activity.Floors", this.fitbit.activities.summary.floors, true);
			this.setState("activity.ActiveMinutes", this.fitbit.activities.summary.veryActiveMinutes, true);
			if (this.fitbit.activities.summary.restingHeartRate)
				this.setState("activity.RestingHeartRate", this.fitbit.activities.summary.restingHeartRate, true);
			this.setState("activity.Calories", this.fitbit.activities.summary.caloriesOut, true);
			this.setState("activity.ActivitiesCount", this.fitbit.activities.activities.length, true);
			return true;
		} else {
			return false;
			//throw new Error("FITBit: No Activity records available");
		}
	}

	async getBodyRecords() {
		//const url = "https://api.fitbit.com/1/user/-/body/log/fat/date/2022-02-01.json";
		const url = `${BASE_URL}-/body/log/weight/date/${this.getDateTime().dateString}.json`;

		const token = this.fitbit.tokens.access_token;
		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${token}` },
					timeout: axiosTimeout
				});
			//this.log.info(`Status: ${response.status}`);

			if (response.status === 200) {
				if (!this.setBodyStates(response.data)) {
					this.log.debug(`Body Records: No weight records avaliable`);
				}
			}
		}
		catch (err) {
			this.log.warn(`getBodyRecords: ${err}`);
		}
	}

	setBodyStates(data) {
		if (data.weight.length > 0) {
			this.fitbit.body = data.weight.slice(-1);				// last record entry from a day

			this.log.info(`Body records: Weight:${this.fitbit.body.weight} Fat:${this.fitbit.body.fat} BMI:${this.fitbit.body.bmi}`);
			this.setState("body.weight", this.fitbit.body.weight, true);
			if (this.fitbit.body.fat)
				this.setState("body.fat", this.fitbit.body.fat, true);
			this.setState("body.bmi", this.fitbit.body.bmi, true);
			return true;
		}
		else {
			return false;
		}
	}

	async getFoodRecords() {

		//const url = "https://api.fitbit.com/1/user/-/foods/log/date/2022-02-01.json";
		const url = `${BASE_URL}-/foods/log/date/${this.getDateTime().dateString}.json`;
		const token = this.fitbit.tokens.access_token;

		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${token}` },
					timeout: axiosTimeout
				});

			if (response.status === 200) {
				if (!this.setFoodStates(response.data)) {
					this.log.debug(`Food Records: No food records avaliable`);
				}
			}
		}
		catch (err) {
			this.log.warn(`getFoodRecords: ${err}`);
		}
	}

	setFoodStates(data) {

		if (data.summary) {
			this.fitbit.food = data.summary;				// First record in the array
			this.log.info(`Food records: Cal:${this.fitbit.food.calories} Water:${this.fitbit.food.water} FAT:${this.fitbit.food.fat} Protein:${this.fitbit.food.protein}`);

			this.setState("food.Water", this.fitbit.food.water, true);
			this.setState("food.Calories", this.fitbit.food.calories, true);
			this.setState("food.Carbs", this.fitbit.food.carbs, true);
			this.setState("food.Sodium", this.fitbit.food.sodium, true);
			this.setState("food.Fiber", this.fitbit.food.fiber, true);
			this.setState("food.Fat", this.fitbit.food.fat, true);
			this.setState("food.Protein", this.fitbit.food.protein, true);
			return true;
		} else {
			return false;
			//throw new Error("FITBit: No Food records available");
		}

	}

	async getSleepRecords() {
		const url = `${BASE2_URL}-/sleep/date/${this.getDateTime().dateString}.json`;
		const token = this.fitbit.tokens.access_token;
		//this.log.info(`url: ${url}`);

		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${token}` },
					timeout: axiosTimeout
				});

			if (response.status === 200) {
				if (!this.setSleepStates(response.data)) {
					this.log.debug(`Sleep Records: No sleep records avaliable`);
				}
			}
		}
		catch (err) {
			this.log.warn(`getSleepRecords:${err}`);
		}
	}
	setSleepStates(data) {
		if (data.sleep.length > 0) {
			this.fitbit.sleep = data.summary.stages;				// First record in the array
			//this.fitbit.sleep = data.summary.stages;				// First record in the array
			this.log.info(`Sleep records: Deep:${this.fitbit.sleep.deep} light:${this.fitbit.sleep.light} rem:${this.fitbit.sleep.rem} wake:${this.fitbit.sleep.wake}`);

			this.setState("sleep.Deep", this.fitbit.sleep.deep, true);
			this.setState("sleep.Light", this.fitbit.sleep.light, true);
			this.setState("sleep.Rem", this.fitbit.sleep.rem, true);
			this.setState("sleep.Wake", this.fitbit.sleep.wake, true);
			return true;
		} else {
			return false;
			//throw new Error("FITBit: No Sleep Data found");
		}
	}

	async getTokenInfo() {

		const token = this.fitbit.tokens.access_token;

		try {
			const url = "https://api.fitbit.com/1.1/oauth2/introspect";
			const payload = `token=${token}`;
			const response = await axios({
				url: url,
				method: "post",
				headers: {
					"authorization": `Bearer ${token}`,
					//'accept': 'application/json',
					//'Content-Type': 'application/x-www-form-urlencoded'
				},
				data: payload
			});
			this.fitbit.tokens = response.data;
			this.log.info(`token expires: ${this.fitbit.tokens.exp}`);

			//await this.setStateAsync("tokens.expire", this.fitbit.tokens.exp, true);
			await this.setStateAsync("tokens.clientid", this.fitbit.tokens.client_id, true);
			await this.setStateAsync("tokens.userid", this.fitbit.tokens.user_id, true);

			return true;
		}
		catch (err) {
			throw new Error(`${err}`);
		}
	}

	async renewToken() {
		try {
			const url = "https://api.fitbit.com/oauth2/token";
			const refreshToken = this.fitbit.tokens.refresh_token;
			const response = await axios({
				url: url,
				method: "post",
				headers: { "Authorization": `Basic ${Buffer.from(clientID + ":" + clientSecret).toString("base64")}` },
				data: "grant_type=refresh_token&refresh_token=" + refreshToken,
				timeout: axiosTimeout
			});
			this.fitbit.tokens = response.data;
			if (response.status === 200) {
				//this.log.info(`renew Token: ${this.fitbit.tokens.access_token} refresh: ${this.fitbit.tokens.refresh_token}`);
				const time = new Date();
				time.setSeconds(time.getSeconds() + this.fitbit.tokens.expires_in);
				await this.setStateAsync("tokens.access", this.fitbit.tokens.access_token, true);
				await this.setStateAsync("tokens.refresh", this.fitbit.tokens.refresh_token, true);
				await this.setStateAsync("tokens.expire", time.toISOString(), true);
				this.log.info(`Token renewed: ${time.toISOString()}`);

				return true;
			} else {
				return false;
			}
		}
		catch (err) {
			this.log.error(`Renew Token`);
		}
	}


	async checkToken() {

		const stateExpire = await this.getStateAsync("tokens.expire");

		if (!stateExpire || !stateExpire.val)
			throw new Error("No valid tokens. Please authenticate in configuration");

		const expireTime = new Date(stateExpire.val.toString()).getTime();
		const now = new Date().getTime();

		//this.log.info(`Expire Date time:${expireTime} DateNow ${now} left ${expireTime - now}`);

		if (expireTime - now < 3600000) {		// < 1 hour refresh the token time.toISOString()
			//if (1 === 1) {
			if (await this.renewToken()) {
				return true;
			} else return false;
		} else {
			//this.fitbit.tokens.token = await this.getStateAsync("tokens.access");
			return true;
		}

	}


	getDateTime(ts = new Date(), addDays = 0) {

		const datetime = {};
		const date = new Date(ts);
		date.setDate(date.getDate() + addDays);
		const dd = date.getDate();
		const mm = date.getMonth() + 1;
		const year = date.getFullYear();

		const hh = date.getHours();
		const mi = date.getMinutes();
		const ss = date.getSeconds();

		datetime.dateString = `${year}-${mm.toString(10).padStart(2, "0")}-${dd.toString(10).padStart(2, "0")}`;
		datetime.date = date;
		datetime.time = `${hh.toString(10).padStart(2, "0")}:${mi.toString(10).padStart(2, "0")}:${ss.toString(10).padStart(2, "0")}`;
		datetime.timeShort = `${hh.toString(10).padStart(2, "0")}:${mi.toString(10).padStart(2, "0")}`;
		datetime.ts = date.getTime();
		return datetime;
	}


	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearInterval(interval1);
			if (this.updateInterval) {
				clearInterval(this.updateInterval);
				this.updateInterval = null;
			}
			if (this.schedule) {
				this.schedule.cancel();
			}
			callback();
		} catch (e) {
			callback();
		}
	}


	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {

		if (state) {
			if (state && state.ack === false) {

				if (id.indexOf("body.weight") !== -1) {
					this.log.info(`weight changed ${id} changed: ${state.val} (ack = ${state.ack})`);
					this.setWeight(state.val);
				}

				// if (id.indexOf("body.fat") !== -1) {
				// 	this.log.info(`fat changed ${id} changed: ${state.val} (ack = ${state.ack})`);
				// 	this.syncHeartRateTS("fitbit-fitness.0.activity.HeartRate-ts");
				// }
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new FitBit(options);
} else {
	// otherwise start the instance directly
	new FitBit();
}