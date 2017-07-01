/*
 *	Program name: jcblock
 *
 *	File name: truncate.c
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
 *	Functions to manage the truncation (removal) of records from the
 *	blacklist.dat and callerID.dat files. Records in the blacklist.dat
 *	file that have not been used to terminate a call in the last nine
 *	months are removed. Records in the callerID.dat file that are older
 *	than nine months are removed. The operations are performed every
 *	thirty days.
 */
#include <stdio.h>
#include <time.h>
#include <errno.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <string.h>
#include <ctype.h>
#include <stdlib.h>
#include "common.h"

#define CHECK_SECS    30*24*60*60       // seconds in thirty days
#define KEEP_SECS  (365-90)*24*60*60    // seconds in (about) nine months
static FILE *fpTime;                    // Pointer for file .jcblock
static FILE *fpCaN;                     // Pointer for file callerID.dat.new
static FILE *fpBlN;                     // Pointer for tile blacklist.dat.new
static time_t currentTime, recordTime;
static char callerBuf[100];
static char blacklistBuf[100];
static char month[3], day[3], year[3];
static int imonth, iday, iyear;
static int numRecsWritten;
static struct tm tmStruct;
static int tm_isdst_saved;

//
// Function to create file .jcblock if it does not already exist. If it does not
// exist, the current UNIX Epoch time (in seconds) is stored in it. The file is
// left open.
//
int create_time_save_file()
{
  bool fileExists = TRUE;
  struct stat statBuf;
  struct tm *tmPtr;
  char strBuf[40];

  errno = 0;
  if( stat( "./.jcblock", &statBuf ) == -1 )
  {
    if( errno == ENOENT )         // if file .jcblock does not exist...
    {
      fileExists = FALSE;
    }
  }
  errno = 0;

  if( fileExists )
  {
    // Open the file for reading and writing
    if( ( fpTime = fopen( "./.jcblock", "r+" ) ) == NULL )
    {
      perror( "create_time_save_file: fopen(1)" );
      return -1;
    }
  }

  else                  // if file does not exist...
  {
    // Create the file for reading and writing
    if( ( fpTime = fopen( "./.jcblock", "w+" ) ) == NULL )
    {
      perror( "create_time_save_file: fopen(2)" );
      return -1;
    }

    if( time( &currentTime ) == -1 )
    {
      perror( "create_time_save_file: time" );
      return -1;
    }

    // Convert currentTime to "broken-down" time.
    tmPtr = localtime( &currentTime );

    // Construct a time string to store in file .jcblock.
    sprintf( strBuf, "MM:%02d DD:%02d YY:%02d\n",
      tmPtr->tm_mon + 1, tmPtr->tm_mday, tmPtr->tm_year - 100 );

    // Write the string to the file.
    if( fputs( strBuf, fpTime ) == EOF )
    {
      perror( "create_time_save.file: fputs" );
      return -1;
    }

    // Make sure its written to the file.
    fflush( fpTime );

    // Save tm_isdst value for later use.
    tm_isdst_saved = tmPtr->tm_isdst;
  }
  return 0;
}

//
// Function to save the current time in the already opened .jcblock
// file.
//
int save_current_time()
{
  struct tm *tmPtr;
  char strBuf[40];

  if( fpTime != NULL )
  {
    if( time( &currentTime ) == -1 )
    {
      perror( "save_current_time: time" );
      return -1;
    }

    // Convert currentTime to "broken-down" time.
    tmPtr = localtime( &currentTime );

    // Construct a time string to store in file .jcblock.
    sprintf( strBuf, "MM:%02d DD:%02d YY:%02d\n",
      tmPtr->tm_mon + 1, tmPtr->tm_mday, tmPtr->tm_year - 100 );

    // Write the string to the file.
    rewind( fpTime );
    if( fputs( strBuf, fpTime ) == EOF )
    {
      perror( "create_time_save.file: fputs" );
      return -1;
    }

    // Make sure its written to the file.
    fflush( fpTime );

    // Save tm_isdst value for later use.
    tm_isdst_saved = tmPtr->tm_isdst;
  }
  else
  {
    printf( "save_current_time: save file not open. time not saved\n" );
    return -1;
  }
  return 0;
}

//
// Function to get the time saved in file .jcblock.
//
time_t get_saved_time()
{
  time_t savedTime;
  struct tm tmStruct;
  char strBuf[40];
  char mmName[5], ddName[5], yyName[5];
  int month, day, year;

  if( fpTime != NULL )
  {
    rewind( fpTime );

    // Get the time string from file .jcblock.
    if( fgets(strBuf, sizeof(strBuf), fpTime ) == NULL )
    {
      perror( "get_saved_time:fgets" );
      return -1;
    }

    // Scan and convert its fields.
    if( sscanf( strBuf, "%3s%d %3s%d %3s%d", mmName, &month,
             ddName, &day, yyName, &year ) != 6 )
    {
      perror( "get_saved_time: sscanf" );
      return -1;
    }
//printf("MM:%02d DD:%02d YY:%02d\n", month, day, year );

    // Make a UNIX Epoch time.
    tmStruct.tm_sec = 0;
    tmStruct.tm_min = 0;
    tmStruct.tm_hour = 0;
    tmStruct.tm_mday = day;
    tmStruct.tm_mon = month - 1;
    tmStruct.tm_year = year + 100;
    tmStruct.tm_wday = 0;
    tmStruct.tm_yday = 0;
    tmStruct.tm_isdst = tm_isdst_saved;

    if( (savedTime = mktime( &tmStruct )) == -1 )
    {
      perror( "get_saved_time:mktime" );
      return -1;
    }
  }
  else
  {
    printf( "get_saved_time: save file not open.\n" );
    return -1;
  }
  return savedTime;
}
 
void close_time_save_file()
{
  fclose( fpTime );
}

//
// Function to truncate (remove) callerID.dat records that are older
// than nine months.
//
int truncate_callerID_records()
{
  int i;
  struct stat statBuf;

  // Close callerID.dat and reopen it for reading.
  fclose( fpCa );
  if( (fpCa = fopen( "./callerID.dat", "r" )) == NULL )
  {
    perror( "truncate_callerID_records:fopen(1)" );
    return -1;
  }

  // Open file callerID.dat.new for appending.
  if( (fpCaN = fopen( "./callerID.dat.new", "a+" )) == NULL )
  {
    perror( "truncate_callerID_records:fopen(2)" );
    return -1;
  }

  // Read and process all records in file callerID.dat.
  numRecsWritten = 0;
  while( fgets( callerBuf, sizeof( callerBuf ), fpCa ) != NULL )
  {
    // If a line starts with a '#' (comment), just write it to file
    // callerID.dat.new.
    if( callerBuf[0] == '#' )
    {
      if( fputs( callerBuf, fpCaN ) < 0 )
      {
        perror( "truncate_callerID_records: fputs(1)" );
        return -1;
      }
      numRecsWritten++;
      continue;
    }

    // Ignore lines that start with a '\n' character (blank lines).
    if( callerBuf[0] == '\n' )
    {
      continue;
    }

    // Make sure the DATE field is present and valid (sometimes
    // (rarely) a record gets scrambled -- due to send timing).
    if( (strlen( callerBuf ) < 14 ) ||
          ( strstr( callerBuf, "DATE = " ) == NULL ) )
    {
      // Just ignore the record
      continue;
    }

    // Check the DATE value for valid digit chars.
    for( i = 9; i < 13; i++ )
    {
      if( !isdigit( callerBuf[i] ) )
      {
        break;
      }
    }
    if( i < 13 )
    {
      continue;
    }

    // Get the month, day and year from the DATE field
    strncpy( month, &callerBuf[9], 2 );
    month[2] = '\0';
    imonth = atoi( month );

    strncpy( day, &callerBuf[11], 2 );
    day[2] = '\0';
    iday = atoi( day );

    strncpy( year, &callerBuf[13], 2 );
    year[2] = '\0';
    iyear = atoi( year );

    // Convert local time to UNIX Epoch time.
    tmStruct.tm_sec = 0;
    tmStruct.tm_min = 0;
    tmStruct.tm_hour = 0;
    tmStruct.tm_mday = iday;
    tmStruct.tm_mon = imonth - 1;
    tmStruct.tm_year = iyear + 100; 
    tmStruct.tm_sec = 0;
    tmStruct.tm_sec = 0;
    tmStruct.tm_isdst = tm_isdst_saved;

    if( (recordTime = mktime( &tmStruct )) == -1 )
    {
      perror( "truncate_callerID_records: mktime" );
      return -1;
    }

    // If recordTime is less than KEEP_SECS old, add the record
    // to file callerID.dat.new. Otherwise, ignore (truncate) it.
    if( (currentTime - recordTime) < KEEP_SECS )
    {
      if( fputs( callerBuf, fpCaN ) < 0 )
      {
        perror( "truncate_callerID_records: fputs(2)" );
        return -1;
      }
      numRecsWritten++;
    }
  }                            // end of while() loop

  fclose(fpCaN);

  // If records were written to callerID.dat.new, rename
  // callerID.dat to callerID.dat.old and callerID.dat.new
  // to callerID.dat.
  if( numRecsWritten )
  {
    // If file callerID.dat.old exists, remove it.
    if( stat( "./callerID.dat.old", &statBuf ) != -1 )
    {
      if( remove( "./callerID.dat.old" ) == -1 )
      {
        perror( "truncate_callerID_records: remove(1)" );
        return -1;
      }
    }

    // Before renaming it, close it.
    fclose(fpCa);
    if( rename( "./callerID.dat", "./callerID.dat.old" ) == -1 )
    {
      perror( "truncate_callerID_records: rename(1)" );
      return -1;
    }

    if( rename ( "./callerID.dat.new", "./callerID.dat" ) == -1 )
    {
      perror( "truncate_callerID_records: rename(2)" );
      return -1;
    }

    // The main() function expects fpCa to be open.
    if( (fpCa = fopen( "callerID.dat", "a+" ) ) == NULL )
    {
      perror( "truncate_callerID_records: fopen" );
      return -1;
    }

    return numRecsWritten;
  }
  // If no records were written, remove file callerID.dat.new.
  else
  {
    if( remove( "./callerID.dat.new" ) == -1 )
    {
      perror( "truncate_callerID_records: remove(2)" );
      return -1;
    }
    return 0;
  }
}

//
// Function to truncate (remove) blacklist.dat records that have
// not been used to terminate a call within the last nine months.
// Note that the date field in blacklist.dat records is updated
// each time a record is used to terminate a call.
//
int truncate_blacklist_records()
{
  int i;
  struct stat statBuf;

  // Close blacklist.dat and reopen it for reading and writing.
  fclose( fpBl );
  if( (fpBl = fopen( "./blacklist.dat", "r+" )) == NULL )
  {
    perror( "truncate_blacklist_records:fopen(1)" );
    return -1;
  }

  // Open file blacklist.dat.new for appending.
  if( (fpBlN = fopen( "./blacklist.dat.new", "a+" )) == NULL )
  {
    perror( "truncate_blacklist_records:fopen(2)" );
    return -1;
  }

  // Read and process all records in file blacklist.dat.
  numRecsWritten = 0;
  while( fgets( blacklistBuf, sizeof( blacklistBuf ), fpBl ) != NULL )
  {
    // If a line starts with a '#' (comment), just write it to file
    // blacklist.dat.new.
    if( blacklistBuf[0] == '#' )
    {
      if( fputs( blacklistBuf, fpBlN ) < 0 )
      {
        perror( "truncate_blacklist_records: fputs(1)" );
        return -1;
      }
      numRecsWritten++;
      continue;
    }

    // Ignore lines that start with a '\n' character (blank line).
    if( blacklistBuf[0] == '\n' )
    {
      continue;
    }

    // Make sure the date field is present (if it was entered
    // manually it might be in error). Record must contain
    // at least 25 characters plus one for the '\n' terminator.
    if( (strlen( blacklistBuf ) < 26 ) )
    {
      // Just ignore the record
      continue;
    }

    // If the record date field indicates that this is a permanent
    // record (i.e., contains "++++++"), add it to blacklist.dat.new.
    if( strncmp( &blacklistBuf[19], "++++++", 6 ) == 0 )
    {
      if( fputs(  blacklistBuf, fpBlN ) < 0 )
      {
        perror( "truncate_blacklist_records: fputs(1a)" );
        return -1;
      }
      numRecsWritten++;
      continue;
    }

    // Check the date value for valid digit chars.
    for( i = 19; i < 25; i++ )
    {
      if( !isdigit( blacklistBuf[i] ) )
      {
        break;
      }
    }
    if( i < 25 )
    {
      continue;
    }

    // Get the month, day and year from the date field
    strncpy( month, &blacklistBuf[19], 2 );
    month[2] = '\0';
    imonth = atoi( month );

    strncpy( day, &blacklistBuf[21], 2 );
    day[2] = '\0';
    iday = atoi( day );

    strncpy( year, &blacklistBuf[23], 2 );
    year[2] = '\0';
    iyear = atoi( year );

    // Convert local time to UNIX Epoch time.
    tmStruct.tm_sec = 0;
    tmStruct.tm_min = 0;
    tmStruct.tm_hour = 0;
    tmStruct.tm_mday = iday;
    tmStruct.tm_mon = imonth - 1;
    tmStruct.tm_year = iyear + 100;
    tmStruct.tm_sec = 0;
    tmStruct.tm_sec = 0;
    tmStruct.tm_isdst = tm_isdst_saved;

    if( (recordTime = mktime( &tmStruct )) == -1 )
    {
      perror( "truncate_blacklist_records: mktime" );
      return -1;
    }

    // If recordTime is less than KEEP_SECS old, add the record
    // to file blacklist.dat.new. Otherwise, ignore it.
    if( (currentTime - recordTime) < KEEP_SECS )
    {
      if( fputs( blacklistBuf, fpBlN ) < 0 )
      {
        perror( "truncate_blacklist_records: fputs(2)" );
        return -1;
      }
      numRecsWritten++;
    }
  }                            // end of while() loop

  fclose(fpBlN);                 // close blacklist.dat.new

  // If records were written to blacklist.dat.new, rename
  // blacklist.dat to blacklist.dat.old and blacklist.dat.new
  // to blacklist.dat.
  if( numRecsWritten )
  {
    // If file blacklist.dat.old exists, remove it.
    if( stat( "./blacklist.dat.old", &statBuf ) != -1 )
    {
      if( remove( "./blacklist.dat.old" ) == -1 )
      {
        perror( "truncate_blacklist_records: remove(1)" );
        return -1;
      }
    }

    // Before renaming blacklist.dat, close it.
    fclose(fpBl);
    if( rename( "./blacklist.dat", "./blacklist.dat.old" ) == -1 )
    {
      perror( "truncate_blacklist_records: rename(1)" );
      return -1;
    }

    if( rename ( "./blacklist.dat.new", "./blacklist.dat" ) == -1 )
    {
      perror( "truncate_blacklist_records: rename(2)" );
      return -1;
    }

    // The main() function expects fpBl to be open.
    if( (fpBl = fopen( "blacklist.dat", "r+" ) ) == NULL )
    {
      perror( "truncate_blacklist_records: fopen" );
      return -1;
    }

    return numRecsWritten;
  }
  // If no records were written, remove file blacklist.dat.new.
  else
  {
    if( remove( "./blacklist.dat.new" ) == -1 )
    {
      perror( "truncate_blacklist_records: remove(2)" );
      return -1;
    }
    return 0;
  }
}

//
// Function to manage the truncation of records from data files.
//
int truncate_records()
{
  time_t savedTime;
  int callerIDRetVal;
  int blacklistRetVal;
  int retVal = 0;

  while(1)
  {
    if( create_time_save_file() == -1 )
    {
      retVal = -1;
      break;
    }

    // Compare the saved time to the current time.
    if( time( &currentTime ) == -1 )
    {
      perror( "truncate_records:time" );
      retVal = -1;
      break;
    }

    if( (savedTime = get_saved_time()) == -1 )
    {
      retVal = -1;
      break;
    }

    // If difference is less than CHECK_SECS, return zero.
    if( (currentTime - savedTime) < CHECK_SECS )
    {
      retVal = 0;
      break;
    }

    callerIDRetVal = truncate_callerID_records();
    blacklistRetVal = truncate_blacklist_records();

    if( ( callerIDRetVal == -1 ) || ( blacklistRetVal == -1 ) )
    {
      retVal = -1;
      break;
    }

    if( ( callerIDRetVal > 0 ) || ( blacklistRetVal > 0 ) )
    {
      if( save_current_time() == -1 )
      {
        retVal = -1;
        break;
      }
      retVal = 1;
    }
    else
    {
      retVal = 0;
    }
    break;
  }

  close_time_save_file();
  return retVal;
}


// The following main() may be activated to test the code in this
// file as a separate program. Compile it with:
//      gcc -o truncate truncate.c
// Manually add some records to the callerID.dat and blacklist.dat
// files that have time fields older than nine months. The program
// should remove them.
#if 0
int main()
{
  int retVal;

  // Note: in main() in file jcblock.c, callerID.dat and
  // blacklist.dat are open when truncate_records() is called.
  // That is simulated here.
  if( (fpCa = fopen( "./callerID.dat", "a+" )) == NULL )
  {
    printf( "main:fopen(1)" );
    return -1;
  }

  if( (fpBl = fopen( "./blacklist.dat", "r+" )) == NULL )
  {
    printf( "main:fopen(2)" );
    return -1;
  }

  retVal = truncate_records();

  printf( "main: truncate_records() returned: %d\n", retVal );
}
#endif

