JumpJump
========

This is a sample game for the [HappyFunTimes party games system](http://greggman.github.io/HappyFunTimes).

<img src="screenshot.png />

I'm in the process of making the games individually installable so that other people can easily add
games to the system. This is the first one so expect lots of churn.

Cloning
-------

Prerequisites

*   node.js http://nodejs.org
*   bower http://bower.io
*   happyfuntimes http://greggman.github.io/HappyFunTimes
*   hft-cli http://github.com/greggman/hft-cli

If you clone this you'll need follow the following steps

1.  install happyfuntimes http://greggman.github.io/HappyFunTimes
2.  install hft-cli by typing `sudo npm install -g hft-cli`
3.  clone this repo
4.  After cloning cd to the folder you just cloned into and type 'bower install'
5.  edit `package.json` and change the `gameId` to some other id.
6.  type `hft add` which will add this to happyFunTimes.



