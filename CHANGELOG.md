# Changelog
<!--
    ## **WORK IN PROGRESS**
-->
## **WORK IN PROGRESS**
- test

## 0.4.3 (2022-06-14)
- fixed lower case iobroker
- moved axios to normal dependency
- changed node.schedule to random schedule with an hour
- prepared for syncing history data will come in the next versions server request to fitbit is pending.

## 0.4.0 (2022-06-09)
- fixed lower case iobroker
- moved axios to normal dependency
- changed node.schedule to random schedule with an hour
- prepared for syncing history data will come in the next versions

## 0.3.10 (2022-04-16)
- added Resting Heartrate

## 0.3.9 (2022-04-16)
- added ActiveMinutes
- added Floors (activities)

## 0.3.8 (2022-04-09)
- corrected the auth method of the redirection

## 0.3.7 (2022-03-24)
- changed the auth method. Tested also with Chrome

## 0.3.1 (2022-03-24)
- changed the auth method. resolved the bug with iframe. Now also chrome is working

## 0.3.0 (2022-03-22)
- changed logging -> debug for detailed logging
- bug fixes

## 0.2.5 (2022-02-20)
- add possibility to read sleep records only in the morning and evening to reduce traffic

## 0.2.4 (2022-02-17)
- changed the auth method (ported from @GermanBluefox fitbit-api)
- added a debug option to reduce the logs
- some minor changes

## 0.2.3 (2022-02-15)
- added Food: Carbs, Fiber, Sodium
- fixed Water recording

## 0.2.2 (2022-02-14)
- Bug fixes

## 0.2.1 (2022-02-14)
- Minor fixes

## 0.2.0 (2022-02-14)
- renamed repo to fitbit-fitness

## 0.1.3 (2022-02-07)
- Add: Loggings adapted
- Fix: Changes Refresh Time to minutes

## 0.1.2 (2022-02-03)
- added Activity Records
- Fixed refresh rate

## 0.1.1 (2022-02-02)
- Minor Fixes

## 0.1.0 (2022-01-30)
- Initial version
- ported parts from projekt @GermanBluefox fitbit-api [GermanBluefox](https://github.com/GermanBluefox)
- [ iobroker-community-adapters/iobroker.fitbit-fitness-api ](https://github.com/iobroker-community-adapters/iobroker.fitbit-fitness-api)
- and adpated and enhanced
- used the new createadapter script to be on the newest adapter standard
- reduced the parallel reading since the web page blocks after some time
- included food and sleep records to be retrieved