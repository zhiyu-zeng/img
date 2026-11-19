---
title: Lessons Learned from Eight Years as an Android Engineer
source: https://dispatchersdotplayground.hashnode.dev/lessons-learned-from-eight-years-as-an-android-engineer
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:49:40+08:00
trace_id: d8910ee3-0447-4368-90d0-5407fc56f4bd
content_hash: f4ad0ff73014acc0657e1b811819feba62966e8f252e29677c129dc5aac53bf9
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8178-b082-c611ea27cad6
ioc: null
---

Hello everyone. It’s been quite a while. Today’s post will not be technical. I wanted to share mostly what I have learned during these eight years working as an Android Developer in a variety of domains, starting with the public sector, b2b software solutions, medical apps all the way to the automotive industry. That has been, in a nutshell, my experience for almost all my professional career. I have only worked on Android with some small exceptions where solutions beyond mobile were needed.

## Knowledge should go beyond just mobile development

Mobile engineering is not just front-end; it’s a tiny level of full stack. Learning that, gives you a broader thinking scope about the project you are working on. If you just focus on making a fancy UI and applying the perfect clean code and architecture, and not thinking about how the information flows and what is the right way to handle it, the project would be destined to fail. You need server side knowledge, database knowledge and last but not least, how everything you are trying to implement works under the hood. Something I also found very helpful to me is the state of an API being used. Ask yourself: What is the early history and how did we end up using this. How did previous generation used to work? For example: new juniour devs join the project, and they get thrown at Compose immediately. What they should also know is how things could be done, if Google decides the next day to drop support of Compose entirely.

## Domain knowledge

Stay hungry curious. Don’t just implement what the ticket asks. Not only question it, but also learn to understand what is the idea behind from the users perspective and how the other departments see this. For instance, I had to do some training which was absolutely crucial when I joined a medical project that dealt with diabetes. Yes, any medical formula applied would be given to you by a medical specialst, but that is not the point. You need to know what happens if you do not apply the formula correctly and how that formula helps the user. The same would happen for me when I switched to the automotive sector. It’s not just about coding the right requirements, I had to read and understand how cars functions and what the drivers actually cared about.

## It has never been about clean code and architecture

It’s amazing, having to open a codebase that has SOLID principles applied. And it’s amazing to work in a team that cares about writing clean code, understanding the requirements and making sure that the codebase does not end up in a mess any time soon. However, there are other factors which usually lead to spaghetti code and hacky workarounds or bandage fixes. Time pressure is one of them. Sometimes you have to sacrifice a unicorn in order to deliver in time. Because, after all, if the client is not happy, then there is no code at all, let alone clean code and well architectured apps.

## Keeps testers close and the clients closer

Bugs. They all make our life miserable. But in any case, before you start working on a bug, ask yourself: What is the impact? Is it really as critical as the Quality Assurance deemed it so? There comes the concept of priority, which is something that your product owner should solve. But they wouldn’t know either, unless you tell them about how severe the bug actually is. And in the end, it’s the clients mentality that needs to be very clear, not just to the POs and managers, but also to the devs. Which immediately brings the next point.

## Business meetings and meetings in general

It is basically normal that developers do not join any meetings with the client, unless they are the Tech Lead or specifically asked for. This is, in my opinion, quite a gray area. Sometimes tech leads just see the big picture and miss the devil in the details. They do not bother with implementation details and the current state of the codebase, they bother with estimations and mostly making only promises that they can keep. But maybe you can see something that nobody can. Therefore, establishing the right communication channels is sometimes vital. In theory, you should not be bothered by business meetings at all. Your time is valuable while implementing. But if you think that your input is valuable, like reaching an unreachable deadline, you always have the power to call something or somebody out.

*When it comes to different types of meetings:*

Just don’t go in case you have nothing to say or nothing to do there. Sometimes meetings are stupid. Places or calls where people just want their timeline to align with yours. Nothing for you. Always be kind to forward that to your managers and make sure to very gently communicate to leave you alone next time. You should not be bothered with meetings that make no sense. As the joke says: This whole thing could have been just an email.

## Security

It’s sad, but a very few care about security while implementing. It’s not specifically a developers job to figure out security implications. But in the perfect world, I would like to see developers also trying to analyse what type of input could compromise a methods parameters to make the software do something that is not intended. Again, in the ideal world, the developer should also be the blue hat of a cybersecurity department too.

## Being too judgmental in code reviews

Been there, done that. Not anymore. The complexity of today’s software is unprecedented. Especially if you work in large code bases with lots of different people, of different cultures and communication styles. No need to show how smart you are by calling out a dumb mistake on the others code review; even if that is just a stupid textbox placement gone wrong. Explain. As much as you can and leave everybody alone. Maybe that misplacement of the textbox has an impact that you have not seen yet.

## Jumping into topics where you have little knowledge

Someone pinged you to review their code about an area you never worked on? Don’t do it. No need to jump in on everything. Keep it small and if you want to learn more, do so before reviewing someone else’s code. It has happened to me quite a lot, that I have reviewed a whole wrong feature or a bug fix where I was not confident enough. Just looking at the code quality from Kotlin’s perspective and everything looked so perfect. Turned out, the dev on the other side, had not fulfilled one single requirement from the ticket.

## Git

Not sure who wants to hear this and how incredible it might sound. But I have seen wonderful engineers who did not know how to use git. Git is your best friend, especially in large code bases. Embrace it, learn it and turn Git into your super power. It saves a trumendous ammount of time, especially during bug fixes and investigations. Why fix a bug when you can just revert a wrongly done PR?

## Promises and definition of done

A big flaw in my early days was the definition of done. I was a very quick developer, and implemented requirements in the fastest way I could. That gave me a lot of confidence to say that certain features, or even projects were done, like done done. Did not expect for bugs, did not expect for any rework and never expected things that would come up that were forgotten. Never be too fast on saying that something is really done. That is something that is decided when the client is satisfied and happy with the product.

## Spend time testing

The more you grow, the less code you write and the more you test. Test - think critically about your work. Do not just rely on QA to do that for you. Their job is testing the feature, your job is to test yourself how good you really are. Spend time with the product, think of other areas where your code could be triggered, gather information about the system as a whole.

AI is your tool, not the other way around

No matter how complex or easy the problem you are trying to solve is, you are the one that pulls the trigger in the end. Trusting AI too much could have terrible business consequences. Stay conservative no matter how smart the future models become. Look at what it does and never blindly trust it.

## You never stop learning

The platform behind your little work is huge. Android is huge. I’ve seen things in Android that I never believed they were possible. The trick here is how to find and know, that what you don’t know. One thing I really hate about the phenomenon of the newcomers coming to the Android community is that they are focused mostly on topics that the others emphasise. In my time it was dependency injection, MVVM and other buzz words which made you look cool as a dev. That’s entirely the wrong direction. The Android needs to be learned as an echosystem, because that’s what it is. All these tools and other legendary concepts cannot be applied correctly if you do not understand how big Android is and in what area you are working on. Furthermore, developing simple apps is always the tip of the iceberg. There is plenty of things you can do in Android that you don’t see every day. You just have to find the right place to work on.

## You may be a really good engineer, but you need to learn how to speak

I’ve been involved in tech reviews lately and to be quite frank, I’ve seen both sides. The tech lead sometimes might be scary, especially on interviews for a new job, but boy there is nothing more painful than a developer with a really good coding skills who is unable to articulate anything. In fact, people during tech talks, do not even think about the technical parts. They just want to see how clear the concept is for you. And if you start talking around, and making a novel out of a simple concept, even if you know and understand it very well, the other part would never realise.

## Don’t talk tech with your product owner and managers

So they call you for an input. They want to know what is wrong or what is taking so long. And then you immediately jump on and say: “Well, the BaseViewModel that the previous devs were using is triggering the coroutine twice. This coroutine I tried to comment it out entirely, and it somehow is still triggered from somewhere else in the system. Now I’m trying to figure out why.” They heard nothing, and to be quite frank you said nothing. They don’t care about implementation details, they want to know if they can help you finish the job. You could instead say: “There is a mechanism which is doing business logic twice and unecessarily. Do you think you can find me another dev to help me in this case? Someone who worked on this previously? Then I hope it should not take too long.” Done. They find someone for you and the issue is not escalated upstairs. It’s not about making bad impressions, it’s about letting them know when this would end, so they know what kind promises to make to the client.

## Ask yourself why

It’s easy to ask why something is not working. How about asking why when everything is fine? This has been my number one lecture for the whole decade. And I got it during a tech interview when I was trying to join the company that I’m currently working with. Why? Why is something working? If you add this questions, you will see yourself doing amazing work.

## Conclusion

What has become important for me in during the last two years is seeing the big picture. People come and go, but code stays. Engineering is mostly about responsibility rather than being just a code monkey. Hopefully I shared some lessons that would help anyone elevate their careers, not just as Android devs, but as platform agnostic engineers.
