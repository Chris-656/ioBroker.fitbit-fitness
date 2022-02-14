"use strict";

/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios").default;
const axiosTimeout = 8000;

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

		// Get system configuration
		// const sysConf = await this.getForeignObjectAsync("system.config");

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.setState("info.connection", false, true);

		this.login().
			then(() => {
				if (this.fitbit.status === 200) {

					this.setState("info.connection", true, true);
					this.getFitbitRecords();					// get data one time

					this.updateInterval = setInterval(() => {
						this.getFitbitRecords();
					}, this.config.refresh * 1000 * 60); 			// in seconds
				} else {
					this.setState("info.connection", false, true);
					this.log.warn(`FITBit login failed ${this.fitbit.status}`);
				}
			})
			.catch((error) => {
				this.log.error(`Adapter Connection Error: ${error} `);
			});


	}
	async getFitbitRecords() {
		this.log.info(`Getting data for user ${this.fitbit.user.fullName}`);
		//const actualDate = new Date().getDate();

		if (this.config.activityrecords) {
			await this.getActivityRecords();
		}
		if (this.config.bodyrecords) {
			await this.getBodyRecords();
		}
		if (this.config.foodrecords) {
			await this.getFoodRecords();
		}
		if (this.config.sleeprecords) {
			await this.getSleepRecords();
		}
	}

	async login() {
		const url = "https://api.fitbit.com/1/user/-/profile.json";
		const token = this.config.token;
		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${token}` },
					timeout: axiosTimeout
				});

			this.fitbit.status = response.status;

			if (this.fitbit.status === 200) {
				this.setState("info.connection", true, true);
				//this.log.info(`Logged in Status: ${response.status}`);
				this.setUserStates(response.data);
			}
		}
		catch (err) {
			throw new Error(err);
		}
	}

	setUserStates(data) {
		this.fitbit.user = data.user;				// Use instance object for data
		this.log.info(`User logged in ${this.fitbit.user.fullName}`);
		this.setState("user.fullName", this.fitbit.user.fullName, true);
	}

	async getActivityRecords() {

		const url = `${BASE_URL}-/activities/date/${this.getDate()}.json`;

		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${this.config.token}` },
					timeout: axiosTimeout
				});
			//this.log.info(`Status: ${response.status}`);

			if (response.status === 200) {
				this.setActivityStates(response.data);
			}
		}
		catch (err) {
			this.log.warn(`Activity Records: No activity records avaliable`);
		}
	}

	setActivityStates(data) {
		if (data.summary) {
			this.fitbit.activities = data;				// First record in the array
			this.log.info(`Activity Records: Steps:${this.fitbit.activities.summary.steps} Calories:${this.fitbit.activities.summary.caloriesOut}`);

			this.setState("activity.Steps", this.fitbit.activities.summary.steps, true);
			this.setState("activity.Calories", this.fitbit.activities.summary.caloriesOut, true);
			this.setState("activity.ActivitiesCount", this.fitbit.activities.activities.length, true);
		} else {
			throw new Error("FITBit: No Activity records available");
		}
	}

	async getBodyRecords() {
		//const url = "https://api.fitbit.com/1/user/-/body/log/fat/date/2022-02-01.json";
		const url = `${BASE_URL}-/body/log/weight/date/${this.getDate()}.json`;

		//const token = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMjdHNUwiLCJzdWIiOiI4OTVXWEQiLCJpc3MiOiJGaXRiaXQiLCJ0eXAiOiJhY2Nlc3NfdG9rZW4iLCJzY29wZXMiOiJ3aHIgd251dCB3cHJvIHdzbGUgd3dlaSB3c29jIHdzZXQgd2FjdCB3bG9jIiwiZXhwIjoxNjQzODk0MTIwLCJpYXQiOjE2NDM4MDc3MjB9.wh7-CEc9Ysdj5CM5Tecs6AwqhWuzaaZ-s2ZMlTPpwIk";
		const token = this.config.token;
		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${token}` },
					timeout: axiosTimeout
				});
			//this.log.info(`Status: ${response.status}`);

			if (response.status === 200) {
				this.setBodyStates(response.data);
			}
		}
		catch (err) {
			this.log.warn(`Body Records: No weight records avaliable`);
		}
	}

	setBodyStates(data) {
		if (data.weight.length > 0) {
			this.fitbit.body = data.weight[0];				// First record in the array
			this.log.info(`Body records: Weight:${this.fitbit.body.weight} Fat:${this.fitbit.body.fat} BMI:${this.fitbit.body.bmi}`);
			this.setState("body.weight", this.fitbit.body.weight, true);
			this.setState("body.fat", this.fitbit.body.fat, true);
			this.setState("body.bmi", this.fitbit.body.bmi, true);
		}
		else {
			throw new Error("FITBit: No Weight records available");
		}
	}

	async getFoodRecords() {

		//const url = "https://api.fitbit.com/1/user/-/foods/log/date/2022-02-01.json";
		const url = `${BASE_URL}-/foods/log/date/${this.getDate()}.json`;

		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${this.config.token}` },
					timeout: axiosTimeout
				});

			if (response.status === 200) {
				this.setFoodStates(response.data);
			}
		}
		catch (err) {
			this.log.warn(`Food Records: No food records avaliable`);
		}
	}

	setFoodStates(data) {

		if (data.foods.length > 0) {
			this.fitbit.food = data.summary;				// First record in the array
			this.log.info(`Food records: Cal:${this.fitbit.food.calories} Water:${this.fitbit.food.water} FAT:${this.fitbit.food.fat} Protein:${this.fitbit.food.protein}`);

			this.setState("food.Water", this.fitbit.food.water, true);
			this.setState("food.Calories", this.fitbit.food.calories, true);
			this.setState("food.Fat", this.fitbit.food.fat, true);
			this.setState("food.Protein", this.fitbit.food.protein, true);
		} else {
			throw new Error("FITBit: No Food records available");
		}

	}

	async getSleepRecords() {
		//const url = "https://api.fitbit.com/1.2/user/-/sleep/date/2022-02-01.json";
		const url = `${BASE2_URL}-/sleep/date/${this.getDate()}.json`;

		try {
			const response = await axios.get(url,
				{
					headers: { "Authorization": `Bearer ${this.config.token}` },
					timeout: axiosTimeout
				});
			//this.log.info(`Food Status: ${response.status}`);

			if (response.status === 200) {
				this.setSleepStates(response.data);
			}
		}
		catch (err) {
			this.log.warn(`Sleep Records: No sleep records avaliable`);
		}
	}
	setSleepStates(data) {
		if (data.sleep.length > 0) {
			this.fitbit.sleep = data.summary.stages;				// First record in the array
			this.log.info(`Sleep records: Deep:${this.fitbit.sleep.deep} light:${this.fitbit.sleep.light} rem:${this.fitbit.sleep.rem} wake:${this.fitbit.sleep.wake}`);

			this.setState("sleep.Deep", this.fitbit.sleep.deep, true);
			this.setState("sleep.Light", this.fitbit.sleep.light, true);
			this.setState("sleep.Rem", this.fitbit.sleep.rem, true);
			this.setState("sleep.Wake", this.fitbit.sleep.wake, true);
		} else {
			throw new Error("FITBit: No Sleep Data found");
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
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			if (this.updateInterval) {
				clearInterval(this.updateInterval);
				this.updateInterval = null;
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