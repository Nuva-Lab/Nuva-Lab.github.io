---
layout: default
title: "Nuva Lab Blog"
description: "Technical notes and founder writing from Nuva Lab on AI infrastructure, open-source systems, and production video models."
---

<div id="posts">
<h1 class="sr-only">Nuva Lab Blog</h1>

{% for post in site.posts %}   
    {% unless post.listed == false %}
        <div class="post">
            <div class="title"><a href="{{post.url}}">{{post.title}}</a></div>
            <div class="info">
                <div class="author">By {{post.author}}</div>
                <div class="date">
                    <i class="fa fa-calendar"></i>
                    {{post.date | date: "%-d %B %Y"}}
                </div>
            </div>
            <p>{{post.excerpt}}</p>
        </div>
    {% endunless %}   
{% endfor %}

</div>
