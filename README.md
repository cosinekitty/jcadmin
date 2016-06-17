# jcadmin
A web-based interface to administrate Walter S. Heath's [jcblock](http://jcblock.sourceforge.net) junk call blocker program.

Jcadmin is a Node.js server designed to run on the same machine as jcblock.
It provides a browser-based interface that machines on your home network can use to view caller ID and easily block annoying phone calls from telemarketers and scammers.

Jcadmin makes maintaining jcblock much easier, eliminating the need to manually edit files.  It also provides an easy way to see how often and when calls have been received from a given phone number.

## Screen shots

- Home screen displays a list of recent calls.

![Call history](https://raw.githubusercontent.com/cosinekitty/jcadmin/master/screenshots/jcadmin-home.png "Call history")

- Click on any call to see detailed info about that caller.

![Caller details](https://raw.githubusercontent.com/cosinekitty/jcadmin/master/screenshots/jcadmin-detail.png "Detail page")

- Sortable phone book shows known callers.

![Phone book](https://raw.githubusercontent.com/cosinekitty/jcadmin/master/screenshots/jcadmin-phonebook.png "Phone book")

## Installation

The author has tested jcadmin on his Debian Jessie machine, but it should work fine on any Linux machine for which Node.js is available, including Raspberry Pi.

- Download and build the [jcblock source code](https://sourceforge.net/projects/jcblock/files/?source=navbar).
- Install Node.js for your Linux system.
- Clone this repo to a separate directory (for example, `/home/youraccount/jcadmin`).
- Change into the jcadmin directory you just created and run the script `./initialize`.
- Create a `run` script to launch jcadmin for you, specifying the port number and jcblock directory on the command line. Here is what mine looks like:
````
#!/bin/bash
cd /home/don/jcadmin
node jcadmin.js 9292 /home/don/phone/jcblock >> jcadmin.log
````
- Be sure to change settings to make this script executable: 
`chmod +x run`.

- You can manually run the script by entering `./run`. Now test this by launching a browser and using the address `http://localhost:9292`.  Substitute whatever port number you put in the `run` script.

- If everything is working, you will now probably want to make your system start the jcadmin and jcblock programs automatically every time it boots up.  I do this using `cron`.  Here is the entry I added to the bottom of my `/etc/crontab` file.  (I have a similar `cron` entry to run `jcblock`.)
````
@reboot don /home/don/jcadmin/run
````
