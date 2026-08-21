import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
Config.setTimeoutInMilliseconds(60000);
Config.setBrowserExecutable("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
Config.setChromiumDisableWebSecurity(true);
Config.setChromiumOpenGlRenderer("swiftshader");
