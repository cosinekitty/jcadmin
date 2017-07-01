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
#include "radio.h"

#include <ifaddrs.h>
#include <netdb.h>
#include <netinet/in.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// A buffer and its running pointer
char broadcastbuffer[82], *bufferpointer;

void
printAndExit(const char *what) {
    printf("%.80s", what);
    exit(-1);
}

void
comment(const char *what) {
    printf("%.80s", what);
}

/**
 * This is what sends the broadcast out to the specified address. 
 */
void
sendTo(struct sockaddr_in *address, struct sockaddr_in *broadcast) {
    int status;      /* Status return code */
    int broadcastsocket;      /* Socket */
    static int do_broadcast = 1;
    /*
     * Create a UDP socket to use:
     */
    broadcastsocket = socket(AF_INET,SOCK_DGRAM,0);
    if ( broadcastsocket == -1 ) {
        comment("socket()");
        return;
    }

    /*
     * Allow broadcasts:
     */
    status = setsockopt(broadcastsocket,
            SOL_SOCKET,
            SO_BROADCAST,
            &do_broadcast,
            sizeof do_broadcast);

    if ( status == -1 ) {
        comment("setsockopt(SO_BROADCAST)");
        return;
    }

    /*
     * Bind an address to our socket, so that
     * client programs can listen to this
     * server:
     */
    status = bind(broadcastsocket,
            (struct sockaddr *)address,
            sizeof(*address));

    if ( status == -1 ) {
        comment("bind()");
        return;
    }

    /*
     * Broadcast the updated info:
     */
    status = sendto(broadcastsocket,
            broadcastbuffer,
            strlen(broadcastbuffer),
            0,
            (struct sockaddr *)broadcast,
            sizeof(*broadcast));

    if ( status == -1 ) {
        printAndExit("sendto()");
        return;
    }
}

static unsigned long SockAddrToUint32(struct sockaddr * a)
{
   return ((a)&&(a->sa_family == AF_INET)) ? ntohl(((struct sockaddr_in *)a)->sin_addr.s_addr) : 0;
}

#ifdef DEBUG
// convert a numeric IP address into its string representation
static void Inet_NtoA(unsigned long addr, char * ipbuf)
{
   sprintf(ipbuf, "%li.%li.%li.%li", (addr>>24)&0xFF, (addr>>16)&0xFF, (addr>>8)&0xFF, (addr>>0)&0xFF);
}

//TODO unused, delete?
// convert a string representation of an IP address into its numeric equivalent
static unsigned long Inet_AtoN(const char * buf)
{
   // net_server inexplicably doesn't have this function; so I'll just fake it
   unsigned long ret = 0;
   int shift = 24;  // fill out the MSB first
   int startQuad = 1;
   while((shift >= 0)&&(*buf))
   {
      if (startQuad)
      {
         unsigned char quad = (unsigned char) atoi(buf);
         ret |= (((unsigned long)quad) << shift);
         shift -= 8;
      }
      startQuad = (*buf == '.');
      buf++;
   }
   return ret;
}
#endif

void CallWithEachAddress(void (callme)(struct sockaddr_in *address, struct sockaddr_in *broadcast))
{
   struct ifaddrs * alladdrs;
   if (getifaddrs(&alladdrs) == 0)
   {
      struct ifaddrs * current = alladdrs;
      while(current)
      {
         unsigned long ifaAddr  = SockAddrToUint32(current->ifa_addr);
         if (ifaAddr > 0)
         {
#ifdef DEBUG
                unsigned long maskAddr = SockAddrToUint32(current->ifa_netmask);
                unsigned long dstAddr  = SockAddrToUint32(current->ifa_dstaddr);
                char ifaAddrStr[32];  Inet_NtoA(ifaAddr,  ifaAddrStr);
                char maskAddrStr[32]; Inet_NtoA(maskAddr, maskAddrStr);
                char dstAddrStr[32];  Inet_NtoA(dstAddr,  dstAddrStr);
                printf("  Found interface:  name=[%s] desc=[%s] address=[%s] netmask=[%s] broadcastAddr=[%s]\n", current->ifa_name, "unavailable", ifaAddrStr, maskAddrStr, dstAddrStr);
#endif
                // Specific to our use, set the port for the broadcast so it can be found by the client.
                // So help us if this is an sockaddr for ipv6
                ((struct sockaddr_in *)current->ifa_dstaddr)->sin_port = htons(PORT);
                callme((struct sockaddr_in *)current->ifa_addr, (struct sockaddr_in *)current->ifa_dstaddr);
         }
         current = current->ifa_next;
      }
      freeifaddrs(alladdrs);
   }
}

int
broadcast(const char * const what) {
    /*
     * Form a message to send out:
     * Max length of 80, no crazy please.
     */
    bufferpointer = broadcastbuffer;
    sprintf(bufferpointer,
            "%.80s\n", what);
    bufferpointer += strlen(bufferpointer);

    CallWithEachAddress(sendTo);
    return 0;
}
