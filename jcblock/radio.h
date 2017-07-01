/*
 *  Library radio
 *
 *	Copyright: 	Copyright 2014 David Brown
 *
 *	Radio is free software: you can redistribute it and/or modify
 *	it under the terms of the GNU General Public License as published by
 *	the Free Software Foundation, either version 3 of the License, or
 *	(at your option) any later version.
 *
 *	This program is distributed in the hope that it will be useful,
 *	but WITHOUT ANY WARRANTY; without even the implied warranty of
 *	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *	GNU General Public License for more details.
 *
 *	You may view a copy of the GNU General Public License at:
 *	           <http://www.gnu.org/licenses/>.
 *
 *	Description:
 *  Coupled with the jcblock program, this library will broadcast the callerID
 *  format string over the network over udp on port 9753, sent via each
 *  available IPv4 address.
 *
 *  Remember when you post code, you never know who might need it and how much
 *  they might truly appreciate it. Even if it's just to hang up on people.
 *
 *  With DEBUG flag at compile time, you get some pretty output.
 */
#ifndef MKADDR_H
#define MKADDR_H

static const int PORT = 9753;
int broadcast(const char * const what);
 
#endif
