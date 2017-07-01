/*
 *	Program name: jcblock
 *
 *	File name: common.h
 *
 *	Copyright:      Copyright 2008 Walter S. Heath
 *
 *	Copy permission:
 *	This program is free software: you can redistribute it and/or modify
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
 *	Declarations common to all .c files.
 */

typedef int bool;

#ifndef TRUE
  #define TRUE 1
  #define FALSE 0
#endif

// Declarations for functions defined in file tones.c.
void tonesInit();
void tonesClearBuffer();
bool tonesPoll();
void tonesClose();

//Declarations for functions defined in file truncate.c.
int truncate_records();

FILE *fpCa;                // callerID.dat file
FILE *fpBl;               // blacklist.dat file

