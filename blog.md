---
layout: default
---

<div id="posts">

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
