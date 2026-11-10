-- Demo companies and providers get names that read like established firms.
create temp table rn (old text, new text) on commit drop;
insert into rn values ('شركة النور للتجارة','أركان للتجارة والتوريدات'),('مخبز الصفا','بيت القمح للمخبوزات'),('ستوديو فكرة للتصميم','أطلس ستوديو للتصميم'),('نونو','سيدار للاستثمار والتطوير'),
 ('مكتب الأمانة للمحاسبة','الميثاق للمحاسبة والمراجعة'),('مكتب النيل للاستشارات','كابيتال هاوس للاستشارات القانونية'),('مكتب الريادة','أفق لخدمات الشركات');
update public.companies c set name = rn.new from rn where c.name = rn.old and c.is_demo;
update public.offices o set name = rn.new from rn where o.name = rn.old and o.is_demo;
update public.notifications n set body = replace(n.body, rn.old, rn.new), title = replace(n.title, rn.old, rn.new)
  from rn where n.body like '%' || rn.old || '%' or n.title like '%' || rn.old || '%';
