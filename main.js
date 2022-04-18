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
// const clientID = '2387KZ';
// const clientSecret = '66f64352fbee230e076360245871bb09';

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
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
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
			this.log.info(`Schedule for sleep activated`);
			this.schedule = mSchedule.scheduleJob("0 10,20 * * *", () => {
				if (this.config.sleeprecords) {
					this.getSleepRecords();
				}
			});
		}
	}
	async getActivityRecords() {

		const url = `${BASE_URL}-/activities/date/${this.getDate()}.json`;
		const token = this.fitbit.tokens.access_token;

		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${token}` },
					timeout: axiosTimeout
				});
			//this.log.info(`Status: ${response.status}`);

			if (response.status === 200) {
				if (!this.setActivityStates(response.data)) {
					this.log.debug(`Activity Records: No activity records avaliable`);
				}
			}
		}
		catch (err) {
			this.log.warn(`${err}`);
		}
	}

	setActivityStates(data) {
		if (data.summary) {
			this.fitbit.activities = data;				// First record in the array
			this.log.info(`Activity Records: Steps:${this.fitbit.activities.summary.steps} Floors:${this.fitbit.activities.summary.floors} Calories:${this.fitbit.activities.summary.caloriesOut} ${(this.fitbit.activities.summary.restingHeartRate)?"BMP:"+this.fitbit.activities.summary.restingHeartRate:""}`);

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
		const url = `${BASE_URL}-/body/log/weight/date/${this.getDate()}.json`;

		//const token = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMjdHNUwiLCJzdWIiOiI4OTVXWEQiLCJpc3MiOiJGaXRiaXQiLCJ0eXAiOiJhY2Nlc3NfdG9rZW4iLCJzY29wZXMiOiJ3aHIgd251dCB3cHJvIHdzbGUgd3dlaSB3c29jIHdzZXQgd2FjdCB3bG9jIiwiZXhwIjoxNjQzODk0MTIwLCJpYXQiOjE2NDM4MDc3MjB9.wh7-CEc9Ysdj5CM5Tecs6AwqhWuzaaZ-s2ZMlTPpwIk";
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
			this.log.warn(`${err}`);
		}
	}

	setBodyStates(data) {
		if (data.weight.length > 0) {
			this.fitbit.body = data.weight[0];				// First record in the array
			this.log.info(`Body records: Weight:${this.fitbit.body.weight} Fat:${this.fitbit.body.fat} BMI:${this.fitbit.body.bmi}`);
			this.setState("body.weight", this.fitbit.body.weight, true);
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
		const url = `${BASE_URL}-/foods/log/date/${this.getDate()}.json`;
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
			this.log.warn(`${err}`);
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
		const url = `${BASE2_URL}-/sleep/date/${this.getDate()}.json`;
		const token = this.fitbit.tokens.access_token;

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
			this.log.warn(`${err}`);
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
		this.log.info(`Expire Date time:${expireTime} left ${expireTime - Date.now()}`);

		if (expireTime - Date.now() < 3600000) {		// < 1 hour refresh the token time.toISOString()
			//if (1 === 1) {
			if (await this.renewToken()) {
				return true;
			} else return false;
		} else {
			//this.fitbit.tokens.token = await this.getStateAsync("tokens.access");
			return true;
		}

	}


	getDate() {
		const today = new Date();
		const dd = today.getDate();
		const mm = today.getMonth() + 1;
		const year = today.getFullYear();

		return `${year}-${mm.toString(10).padStart(2, "0")}-${dd.toString(10).padStart(2, "0")}`;
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

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

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